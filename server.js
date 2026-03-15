const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const port = process.env.PORT || 3000;

// ─── Catch crashes ────────────────────────────────────────
process.on('uncaughtException',  e => console.error('UNCAUGHT:', e));
process.on('unhandledRejection', e => console.error('UNHANDLED:', e));

// ─── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health check (ตอบทันที ไม่ต้อง DB) ──────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── MySQL Pool ────────────────────────────────────────────
const pool = mysql.createPool({
  host:                  process.env.MYSQLHOST     || 'localhost',
  user:                  process.env.MYSQLUSER     || 'root',
  password:              process.env.MYSQLPASSWORD || '',
  database:              process.env.MYSQLDATABASE || 'smart_classroom',
  port:                  parseInt(process.env.MYSQLPORT) || 3306,
  waitForConnections:    true,
  connectionLimit:       10,
  queueLimit:            0,
  enableKeepAlive:       true,
  keepAliveInitialDelay: 0
}).promise();

pool.getConnection()
  .then(conn => { console.log('✅ เชื่อมต่อ MySQL Pool สำเร็จ!'); conn.release(); })
  .catch(err  => console.error('❌ เชื่อมต่อไม่สำเร็จ:', err.message));

const query = (sql, params = []) => pool.query(sql, params).then(([rows]) => rows);

// ─── Helper: คำนวณว่ามาสายกี่นาทีจาก TIME ────────────────
function minutesLate(checkin, classStart) {
  if (!checkin || !classStart) return 0;
  const [ch, cm] = String(checkin).split(':').map(Number);
  const [sh, sm] = String(classStart).split(':').map(Number);
  return (ch * 60 + cm) - (sh * 60 + sm);
}

// ─── Helper: แปลง day_of_week ไทย → index ───────────────
const DAY_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์'];

// ═══════════════════════════════════════════════════════════
// 🛠️  DATABASE SETUP — เปิด /api/setup ใน browser เพื่อสร้าง DB อัตโนมัติ
// ═══════════════════════════════════════════════════════════

app.get('/api/setup', async (req, res) => {
  try {
    const conn = await pool.getConnection();

    // ── DROP เก่าทั้งหมด ──
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const dropTables = [
      'Submission','AttendanceAnalysis','Attendance','Grade','Score',
      'Assignment','Schedule','Enrollment','Course','Classroom',
      'Student','Teacher','Admin','Users','User'
    ];
    for (const t of dropTables) {
      await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await conn.query('DROP VIEW IF EXISTS GradeView');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ── สร้างตารางใหม่ตาม ER v4 ──
    await conn.query(`
      CREATE TABLE Users (
        user_id     VARCHAR(20)  NOT NULL,
        username    VARCHAR(100) NOT NULL UNIQUE,
        password    VARCHAR(255) NOT NULL,
        role        ENUM('admin','teacher','student') NOT NULL,
        email       VARCHAR(200) NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id)
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Admin (
        admin_id   VARCHAR(20)  NOT NULL,
        full_name  VARCHAR(100) NULL,
        phone      VARCHAR(20)  NULL,
        email      VARCHAR(200) NULL,
        PRIMARY KEY (admin_id),
        FOREIGN KEY (admin_id) REFERENCES Users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Teacher (
        teacher_id  VARCHAR(20)  NOT NULL,
        name        VARCHAR(100) NOT NULL,
        department  VARCHAR(150) NULL,
        phone       VARCHAR(20)  NULL,
        email       VARCHAR(200) NULL,
        PRIMARY KEY (teacher_id),
        FOREIGN KEY (teacher_id) REFERENCES Users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Student (
        student_id  VARCHAR(20)  NOT NULL,
        name        VARCHAR(100) NOT NULL,
        email       VARCHAR(200) NULL,
        phone       VARCHAR(20)  NULL,
        gender      ENUM('male','female','other') NULL,
        PRIMARY KEY (student_id),
        FOREIGN KEY (student_id) REFERENCES Users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Classroom (
        room_id    VARCHAR(20)  NOT NULL,
        room_name  VARCHAR(100) NOT NULL,
        capacity   INT          NOT NULL DEFAULT 40,
        floor      INT          NULL,
        room_type  VARCHAR(50)  NULL,
        PRIMARY KEY (room_id)
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Course (
        course_id     VARCHAR(20)  NOT NULL,
        course_code   VARCHAR(20)  NULL,
        course_name   VARCHAR(200) NOT NULL,
        credit        INT          DEFAULT 3,
        semester      INT          DEFAULT 1,
        academic_year INT          DEFAULT 2568,
        teacher_id    VARCHAR(20)  NOT NULL,
        admin_id      VARCHAR(20)  NULL,
        PRIMARY KEY (course_id),
        FOREIGN KEY (teacher_id) REFERENCES Teacher(teacher_id),
        FOREIGN KEY (admin_id)   REFERENCES Admin(admin_id)
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Enrollment (
        enrollment_id  INT         NOT NULL AUTO_INCREMENT,
        student_id     VARCHAR(20) NOT NULL,
        course_id      VARCHAR(20) NOT NULL,
        enrolled_at    DATETIME    DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (enrollment_id),
        UNIQUE KEY uq_enroll (student_id, course_id),
        FOREIGN KEY (student_id) REFERENCES Student(student_id) ON DELETE CASCADE,
        FOREIGN KEY (course_id)  REFERENCES Course(course_id)   ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Schedule (
        schedule_id   INT         NOT NULL AUTO_INCREMENT,
        course_id     VARCHAR(20) NOT NULL,
        room_id       VARCHAR(20) NOT NULL,
        day_of_week   VARCHAR(20) NOT NULL,
        start_time    TIME        NOT NULL,
        end_time      TIME        NOT NULL,
        study_hours   DECIMAL(4,1) DEFAULT 2.0,
        semester      INT          DEFAULT 1,
        academic_year INT          DEFAULT 2568,
        PRIMARY KEY (schedule_id),
        FOREIGN KEY (course_id) REFERENCES Course(course_id)   ON DELETE CASCADE,
        FOREIGN KEY (room_id)   REFERENCES Classroom(room_id)
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Attendance (
        attendance_id    INT         NOT NULL AUTO_INCREMENT,
        student_id       VARCHAR(20) NOT NULL,
        schedule_id      INT         NOT NULL,
        attendance_date  DATE        NOT NULL,
        check_in_time    TIME        NULL,
        status           ENUM('present','absent','late','excused') NOT NULL DEFAULT 'absent',
        PRIMARY KEY (attendance_id),
        UNIQUE KEY uq_attend (student_id, schedule_id, attendance_date),
        FOREIGN KEY (student_id)  REFERENCES Student(student_id)   ON DELETE CASCADE,
        FOREIGN KEY (schedule_id) REFERENCES Schedule(schedule_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE AttendanceAnalysis (
        analysis_id     INT         NOT NULL AUTO_INCREMENT,
        student_id      VARCHAR(20) NOT NULL,
        course_id       VARCHAR(20) NOT NULL,
        total_classes   INT         DEFAULT 0,
        absent_count    INT         DEFAULT 0,
        late_count      INT         DEFAULT 0,
        attendance_rate DECIMAL(5,2) DEFAULT 0,
        risk_level      ENUM('Low','Medium','High') DEFAULT 'Low',
        updated_at      DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (analysis_id),
        UNIQUE KEY uq_analysis (student_id, course_id),
        FOREIGN KEY (student_id) REFERENCES Student(student_id) ON DELETE CASCADE,
        FOREIGN KEY (course_id)  REFERENCES Course(course_id)   ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Grade (
        grade_id       INT         NOT NULL AUTO_INCREMENT,
        student_id     VARCHAR(20) NOT NULL,
        course_id      VARCHAR(20) NOT NULL,
        grade_letter   VARCHAR(5)  NULL,
        total_score    DECIMAL(5,2) DEFAULT 0,
        attend_score   DECIMAL(5,2) DEFAULT 0,
        attitude_score DECIMAL(5,2) DEFAULT 0,
        homework_score DECIMAL(5,2) DEFAULT 0,
        midterm_score  DECIMAL(5,2) DEFAULT 0,
        final_score    DECIMAL(5,2) DEFAULT 0,
        quiz_score     DECIMAL(5,2) DEFAULT 0,
        semester       INT          DEFAULT 1,
        academic_year  INT          DEFAULT 2568,
        updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (grade_id),
        UNIQUE KEY uq_grade (student_id, course_id),
        FOREIGN KEY (student_id) REFERENCES Student(student_id) ON DELETE CASCADE,
        FOREIGN KEY (course_id)  REFERENCES Course(course_id)   ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Assignment (
        assignment_id  INT          NOT NULL AUTO_INCREMENT,
        course_id      VARCHAR(20)  NOT NULL,
        title          VARCHAR(200) NOT NULL,
        description    VARCHAR(300) NULL,
        due_date       DATETIME     NOT NULL,
        max_score      DECIMAL(5,2) DEFAULT 100,
        created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (assignment_id),
        FOREIGN KEY (course_id) REFERENCES Course(course_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE Submission (
        submission_id  INT         NOT NULL AUTO_INCREMENT,
        assignment_id  INT         NOT NULL,
        student_id     VARCHAR(20) NOT NULL,
        score          DECIMAL(5,2) NULL,
        submit_date    DATETIME     DEFAULT CURRENT_TIMESTAMP,
        graded_date    DATETIME     NULL,
        status         ENUM('submitted','graded','late') DEFAULT 'submitted',
        PRIMARY KEY (submission_id),
        UNIQUE KEY uq_submit (assignment_id, student_id),
        FOREIGN KEY (assignment_id) REFERENCES Assignment(assignment_id) ON DELETE CASCADE,
        FOREIGN KEY (student_id)    REFERENCES Student(student_id)       ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE VIEW GradeView AS
      SELECT
        g.student_id,
        s.name AS student_name,
        g.course_id,
        c.course_name,
        g.attend_score,
        g.attitude_score,
        g.homework_score,
        g.midterm_score,
        g.final_score,
        g.quiz_score,
        g.total_score,
        g.grade_letter AS grade
      FROM Grade g
      JOIN Student s ON g.student_id = s.student_id
      JOIN Course  c ON g.course_id  = c.course_id
    `);

    // ── INSERT SAMPLE DATA ──
    await conn.query(`INSERT INTO Users (user_id, username, password, role, email) VALUES
      ('ADM001','admin','admin1234','admin','admin@kku.ac.th'),
      ('TCH001','teacher1','teach1234','teacher','teacher1@kku.ac.th'),
      ('TCH002','teacher2','teach5678','teacher','teacher2@kku.ac.th'),
      ('683380495-2','saksorn','1234','student','saksorn.p@kkumail.com'),
      ('683380495-3','somchai','1234','student','somchai@kkumail.com'),
      ('683380495-4','somsri','1234','student','somsri@kkumail.com'),
      ('683380495-5','anucha','1234','student','anucha@kkumail.com'),
      ('683380495-6','wichai','1234','student','wichai@kkumail.com'),
      ('683380495-7','malai','1234','student','malai@kkumail.com')
    `);

    await conn.query(`INSERT INTO Admin (admin_id, full_name, phone, email) VALUES
      ('ADM001','ผู้ดูแลระบบ','043-000-001','admin@kku.ac.th')
    `);

    await conn.query(`INSERT INTO Teacher (teacher_id, name, department, phone, email) VALUES
      ('TCH001','อ.ดร.วิชัย สอนดี','ภาควิชาวิทยาการคอมพิวเตอร์','043-000-101','teacher1@kku.ac.th'),
      ('TCH002','อ.มาลี รักสอน','ภาควิชาวิทยาการคอมพิวเตอร์','043-000-102','teacher2@kku.ac.th')
    `);

    await conn.query(`INSERT INTO Student (student_id, name, email, phone, gender) VALUES
      ('683380495-2','ศักย์ศรณ์ พละศักดิ์','saksorn.p@kkumail.com','081-001-0001','male'),
      ('683380495-3','นายสมชาย ใจดี','somchai@kkumail.com','081-001-0002','male'),
      ('683380495-4','นางสาวสมศรี รักเรียน','somsri@kkumail.com','081-001-0003','female'),
      ('683380495-5','นายอนุชา มานะดี','anucha@kkumail.com','081-001-0004','male'),
      ('683380495-6','นายวิชัย สุขใจ','wichai@kkumail.com','081-001-0005','male'),
      ('683380495-7','นางสาวมาลี งามดี','malai@kkumail.com','081-001-0006','female')
    `);

    await conn.query(`INSERT INTO Classroom (room_id, room_name, capacity, floor, room_type) VALUES
      ('SC5102','SC5102',50,5,'บรรยาย'),('GL149','GL149',80,1,'บรรยาย'),
      ('CP9127','CP9127',40,1,'ปฏิบัติ'),('SC9107','SC9107',60,9,'บรรยาย'),
      ('SC6201','SC6201',50,2,'ปฏิบัติ'),('SC1103','ตึกกลม',60,1,'บรรยาย'),
      ('SC9227','SC9227',40,2,'ปฏิบัติ'),('GL213','GL213',80,2,'บรรยาย')
    `);

    await conn.query(`INSERT INTO Course (course_id, course_code, course_name, credit, semester, academic_year, teacher_id, admin_id) VALUES
      ('SC602005','SC602005','ความน่าจะเป็นและสถิติ (PROBABILITY AND STATISTICS)',3,1,2568,'TCH001','ADM001'),
      ('LI101001','LI101001','ภาษาอังกฤษ 1 (ENGLISH I)',3,1,2568,'TCH002','ADM001'),
      ('CP411106','CP411106','การเขียนโปรแกรมสำหรับ ML (Programming for Machine Learning)',3,1,2568,'TCH001','ADM001'),
      ('SC401201','SC401201','แคลคูลัสสำหรับวิทยาศาสตร์กายภาพ 1 (CALCULUS FOR PHYSICAL SCIENCE I)',3,1,2568,'TCH001','ADM001'),
      ('CP411105','CP411105','ระบบคอมพิวเตอร์ (Computer Systems)',3,1,2568,'TCH001','ADM001'),
      ('CP411701','CP411701','แรงบันดาลใจของปัญญาประดิษฐ์ (AI Inspiration)',2,1,2568,'TCH002','ADM001'),
      ('GE341511','GE341511','การคิดเชิงคำนวณและสถิติ (Computational & Statistical Thinking for ABCD)',3,1,2568,'TCH002','ADM001')
    `);

    await conn.query(`INSERT INTO Schedule (course_id, room_id, day_of_week, start_time, end_time, study_hours) VALUES
      ('SC602005','SC5102','จันทร์','10:00:00','12:00:00',2.0),
      ('SC602005','SC5102','พุธ','10:00:00','12:00:00',2.0),
      ('LI101001','GL149','อังคาร','09:00:00','10:00:00',1.0),
      ('LI101001','GL149','พฤหัสฯ','09:00:00','10:00:00',1.0),
      ('CP411106','CP9127','อังคาร','13:00:00','15:00:00',2.0),
      ('CP411106','SC9227','พฤหัสฯ','15:00:00','17:00:00',2.0),
      ('SC401201','SC9107','อังคาร','16:00:00','18:00:00',2.0),
      ('SC401201','SC9107','พฤหัสฯ','16:00:00','18:00:00',2.0),
      ('CP411105','SC6201','พุธ','13:00:00','15:00:00',2.0),
      ('CP411701','SC1103','พฤหัสฯ','10:00:00','12:00:00',2.0),
      ('GE341511','GL213','ศุกร์','13:00:00','15:00:00',2.0)
    `);

    // Enrollment — ทุกคนลงทุกวิชา
    await conn.query(`INSERT INTO Enrollment (student_id, course_id)
      SELECT s.student_id, c.course_id FROM Student s CROSS JOIN Course c
    `);

    // Attendance sample (saksorn + others)
    await conn.query(`INSERT INTO Attendance (student_id, schedule_id, attendance_date, check_in_time, status) VALUES
      ('683380495-2',1,'2026-02-02','10:03:00','present'),('683380495-2',1,'2026-02-09','10:18:00','late'),
      ('683380495-2',1,'2026-02-16','10:05:00','present'),('683380495-2',1,'2026-02-23',NULL,'absent'),
      ('683380495-2',2,'2026-02-04','10:08:00','present'),('683380495-2',2,'2026-02-11',NULL,'absent'),
      ('683380495-2',2,'2026-02-18','10:05:00','present'),('683380495-2',2,'2026-02-25','10:20:00','late'),
      ('683380495-2',3,'2026-02-03','09:02:00','present'),('683380495-2',3,'2026-02-10','09:22:00','late'),
      ('683380495-2',3,'2026-02-17','09:01:00','present'),('683380495-2',3,'2026-02-24','09:00:00','present'),
      ('683380495-2',5,'2026-02-03','13:05:00','present'),('683380495-2',5,'2026-02-10',NULL,'absent'),
      ('683380495-2',5,'2026-02-17','13:22:00','late'),('683380495-2',5,'2026-02-24','13:04:00','present'),
      ('683380495-2',9,'2026-02-04','13:10:00','present'),('683380495-2',9,'2026-02-11','13:30:00','late'),
      ('683380495-2',9,'2026-02-18','13:02:00','present'),('683380495-2',9,'2026-02-25','13:00:00','present'),
      ('683380495-2',10,'2026-02-05','10:05:00','present'),('683380495-2',10,'2026-02-12','10:02:00','present'),
      ('683380495-2',10,'2026-02-19','10:18:00','late'),('683380495-2',10,'2026-02-26','10:04:00','present'),
      ('683380495-2',11,'2026-02-06','13:05:00','present'),('683380495-2',11,'2026-02-13',NULL,'absent'),
      ('683380495-2',11,'2026-02-20','13:03:00','present'),('683380495-2',11,'2026-02-27','13:22:00','late'),
      ('683380495-3',1,'2026-02-02','10:05:00','present'),('683380495-3',1,'2026-02-09','10:25:00','late'),
      ('683380495-3',1,'2026-02-16',NULL,'absent'),('683380495-3',1,'2026-02-23','10:02:00','present'),
      ('683380495-3',5,'2026-02-03','13:02:00','present'),('683380495-3',5,'2026-02-10','13:25:00','late'),
      ('683380495-3',5,'2026-02-17','13:01:00','present'),('683380495-3',5,'2026-02-24',NULL,'absent'),
      ('683380495-4',9,'2026-02-04',NULL,'absent'),('683380495-4',9,'2026-02-11','13:05:00','present'),
      ('683380495-4',9,'2026-02-18','13:20:00','late'),('683380495-4',9,'2026-02-25','13:03:00','present'),
      ('683380495-4',3,'2026-02-03','09:05:00','present'),('683380495-4',3,'2026-02-10','09:22:00','late'),
      ('683380495-4',3,'2026-02-17','09:01:00','present'),('683380495-4',3,'2026-02-24','09:00:00','present'),
      ('683380495-5',1,'2026-02-02',NULL,'absent'),('683380495-5',1,'2026-02-09',NULL,'absent'),
      ('683380495-5',1,'2026-02-16','10:35:00','late'),('683380495-5',1,'2026-02-23','10:05:00','present'),
      ('683380495-5',10,'2026-02-05','10:01:00','present'),('683380495-5',10,'2026-02-12',NULL,'absent'),
      ('683380495-5',10,'2026-02-19','10:05:00','present'),('683380495-5',10,'2026-02-26','10:20:00','late'),
      ('683380495-6',7,'2026-02-03','16:00:00','present'),('683380495-6',7,'2026-02-10','16:02:00','present'),
      ('683380495-6',7,'2026-02-17','16:20:00','late'),('683380495-6',7,'2026-02-24','16:01:00','present'),
      ('683380495-6',11,'2026-02-06','13:04:00','present'),('683380495-6',11,'2026-02-13','13:25:00','late'),
      ('683380495-6',11,'2026-02-20','13:01:00','present'),('683380495-6',11,'2026-02-27',NULL,'absent'),
      ('683380495-7',5,'2026-02-03','13:03:00','present'),('683380495-7',5,'2026-02-10','13:01:00','present'),
      ('683380495-7',5,'2026-02-17','13:18:00','late'),('683380495-7',5,'2026-02-24','13:05:00','present'),
      ('683380495-7',4,'2026-02-05','09:00:00','present'),('683380495-7',4,'2026-02-12',NULL,'absent'),
      ('683380495-7',4,'2026-02-19','09:06:00','present'),('683380495-7',4,'2026-02-26','09:22:00','late')
    `);

    // Grade sample
    await conn.query(`INSERT INTO Grade (student_id,course_id,attend_score,attitude_score,homework_score,midterm_score,final_score,quiz_score,total_score,grade_letter,semester,academic_year) VALUES
      ('683380495-2','SC602005',18,9,17,26,34,16,120,'A',1,2568),
      ('683380495-2','LI101001',19,9,18,27,35,17,125,'A',1,2568),
      ('683380495-2','CP411106',20,10,19,28,37,18,132,'A',1,2568),
      ('683380495-2','SC401201',17,8,16,24,32,15,112,'B+',1,2568),
      ('683380495-2','CP411105',18,9,17,25,33,16,118,'A',1,2568),
      ('683380495-2','CP411701',15,7,14,20,28,13,97,'B',1,2568),
      ('683380495-2','GE341511',16,8,15,22,30,14,105,'B+',1,2568),
      ('683380495-3','SC602005',15,7,14,20,28,12,96,'B',1,2568),
      ('683380495-3','CP411106',16,8,15,22,30,13,104,'B+',1,2568),
      ('683380495-4','SC602005',20,10,20,29,38,19,136,'A',1,2568),
      ('683380495-4','CP411106',20,10,20,30,39,19,138,'A',1,2568),
      ('683380495-5','SC602005',10,5,9,14,19,8,65,'C',1,2568),
      ('683380495-5','CP411106',12,6,11,16,21,9,75,'B+',1,2568),
      ('683380495-6','SC602005',17,8,16,24,32,15,112,'B+',1,2568),
      ('683380495-6','CP411106',17,8,16,24,32,15,112,'B+',1,2568),
      ('683380495-7','SC602005',19,10,18,27,36,17,127,'A',1,2568),
      ('683380495-7','CP411106',18,9,17,26,34,16,120,'A',1,2568)
    `);

    // Assignment sample
    await conn.query(`INSERT INTO Assignment (course_id,title,description,due_date,max_score) VALUES
      ('SC602005','Quiz: Probability Basics','แบบทดสอบความน่าจะเป็นเบื้องต้น','2026-03-10 23:59:00',20),
      ('SC602005','Project: Statistics Report','รายงานสถิติจากข้อมูลจริง','2026-04-10 23:59:00',30),
      ('LI101001','Essay: My Hometown','เขียน Essay ภาษาอังกฤษ','2026-03-20 23:59:00',20),
      ('CP411106','Lab: Data Preprocessing','ทำความสะอาดและเตรียมข้อมูล','2026-03-25 23:59:00',20),
      ('CP411106','Project: ML Classification','สร้างโมเดล Classification','2026-04-20 23:59:00',40),
      ('SC401201','Homework: Derivatives','แบบฝึกหัดการหาอนุพันธ์','2026-04-01 23:59:00',20),
      ('CP411105','Lab: CPU Scheduling','จำลองการทำงาน CPU Scheduling','2026-03-28 23:59:00',25),
      ('CP411701','Essay: AI in Daily Life','เขียนความเรียงเกี่ยวกับ AI','2026-03-18 23:59:00',25),
      ('GE341511','Quiz: Statistical Thinking','แบบทดสอบการคิดเชิงสถิติ','2026-03-22 23:59:00',20)
    `);

    // AttendanceAnalysis sample
    await conn.query(`INSERT INTO AttendanceAnalysis (student_id,course_id,total_classes,absent_count,late_count,attendance_rate,risk_level) VALUES
      ('683380495-2','SC602005',4,1,1,75.00,'Medium'),
      ('683380495-2','CP411106',4,1,1,75.00,'Medium'),
      ('683380495-2','CP411105',4,0,1,100.00,'Low'),
      ('683380495-2','CP411701',4,0,1,100.00,'Low'),
      ('683380495-2','GE341511',4,1,1,75.00,'Medium'),
      ('683380495-3','SC602005',4,1,1,75.00,'Medium'),
      ('683380495-3','CP411106',4,1,1,75.00,'Medium'),
      ('683380495-5','SC602005',4,2,1,25.00,'High'),
      ('683380495-5','CP411701',4,1,1,75.00,'Medium')
    `);

    conn.release();
    res.send('<h1 style="color:green;font-family:sans-serif;">✅ Database setup สำเร็จ!</h1><p style="font-family:sans-serif;">สร้างตารางและข้อมูลทดสอบเรียบร้อย<br><br><a href="/">← กลับไปหน้าเว็บ</a></p>');
  } catch (e) {
    console.error('Setup error:', e.message);
    res.status(500).send('<h1 style="color:red;font-family:sans-serif;">❌ Setup ล้มเหลว</h1><pre>' + e.message + '</pre>');
  }
});

// ═══════════════════════════════════════════════════════════
// AUTH APIs  (ใช้ตาราง Users, username)
// ═══════════════════════════════════════════════════════════

// POST /api/register
app.post('/api/register', async (req, res) => {
  const {
    username, password,
    firstname, lastname,
    student_id, email,
    role = 'student'
  } = req.body;

  if (!username || !password || !firstname || !lastname || !email)
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });

  const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailReg.test(email))
    return res.status(400).json({ success: false, message: 'รูปแบบ Email ไม่ถูกต้อง' });

  const fullName = `${firstname.trim()} ${lastname.trim()}`;

  try {
    const existUser = await query('SELECT user_id FROM Users WHERE username = ?', [username]);
    if (existUser.length > 0)
      return res.status(409).json({ success: false, message: 'Username นี้มีคนใช้แล้ว' });

    let newId;
    if (student_id && student_id.trim() !== '') {
      const existId = await query('SELECT user_id FROM Users WHERE user_id = ?', [student_id.trim()]);
      if (existId.length > 0)
        return res.status(409).json({ success: false, message: 'รหัสนิสิต ' + student_id + ' มีในระบบแล้ว' });
      newId = student_id.trim();
    } else {
      const prefix = role === 'teacher' ? 'TCH' : role === 'admin' ? 'ADM' : 'STU';
      const rows   = await query('SELECT COUNT(*) AS cnt FROM Users WHERE role = ?', [role]);
      newId = prefix + String(rows[0].cnt + 1).padStart(3, '0');
    }

    await query('INSERT INTO Users (user_id, username, password, role, email) VALUES (?,?,?,?,?)',
      [newId, username, password, role, email]);

    if (role === 'student')
      await query('INSERT INTO Student (student_id, name) VALUES (?,?)', [newId, fullName]);
    if (role === 'teacher')
      await query('INSERT INTO Teacher (teacher_id, name) VALUES (?,?)', [newId, fullName]);
    if (role === 'admin')
      await query('INSERT INTO Admin (admin_id, full_name) VALUES (?,?)', [newId, fullName]);

    res.json({ success: true, message: 'ลงทะเบียนสำเร็จ!', user_id: newId, name: fullName });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const rows = await query(
      'SELECT * FROM Users WHERE username = ? AND password = ?', [username, password]);
    if (rows.length === 0)
      return res.status(401).json({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' });

    const user = rows[0];
    let name = user.username;

    if (user.role === 'student') {
      const s = await query('SELECT name FROM Student WHERE student_id = ?', [user.user_id]);
      if (s.length) name = s[0].name;
    } else if (user.role === 'teacher') {
      const t = await query('SELECT name FROM Teacher WHERE teacher_id = ?', [user.user_id]);
      if (t.length) name = t[0].name;
    } else if (user.role === 'admin') {
      const a = await query('SELECT full_name FROM Admin WHERE admin_id = ?', [user.user_id]);
      if (a.length && a[0].full_name) name = a[0].full_name;
    }

    res.json({ success: true, user_id: user.user_id, username: user.username, role: user.role, name });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GRADE APIs
// ═══════════════════════════════════════════════════════════

app.get('/api/grades/:student_id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM GradeView WHERE student_id = ?', [req.params.student_id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลของ ' + req.params.student_id });
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// SCHEDULE APIs  (ใช้ start_time + end_time)
// ═══════════════════════════════════════════════════════════

app.get('/api/schedule/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        sc.day_of_week                                                AS day,
        CONCAT(TIME_FORMAT(sc.start_time,'%H:%i'),'-',TIME_FORMAT(sc.end_time,'%H:%i')) AS time,
        c.course_id                                                   AS code,
        c.course_name                                                 AS name,
        t.name                                                        AS teacher,
        cr.room_name                                                  AS room
      FROM Enrollment e
      JOIN Course    c  ON e.course_id  = c.course_id
      JOIN Schedule  sc ON c.course_id  = sc.course_id
      JOIN Teacher   t  ON c.teacher_id = t.teacher_id
      JOIN Classroom cr ON sc.room_id   = cr.room_id
      WHERE e.student_id = ?
      ORDER BY FIELD(sc.day_of_week,'จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์','อาทิตย์'),
               sc.start_time
    `, [req.params.student_id]);

    if (!rows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบตารางเรียนของ ' + req.params.student_id });
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// SCORE/GRADE APIs  (ใช้ Grade table)
// ═══════════════════════════════════════════════════════════

app.get('/api/score/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT g.*, s.name AS student_name, c.course_name
      FROM Grade g
      JOIN Student s ON g.student_id = s.student_id
      JOIN Course  c ON g.course_id  = c.course_id
      WHERE g.student_id = ?
    `, [req.params.student_id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบคะแนนของ ' + req.params.student_id });
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/score', async (req, res) => {
  const { student_id, course_id, attend_score, attitude_score,
          homework_score, midterm_score, final_score, quiz_score } = req.body;
  if (!student_id || !course_id)
    return res.status(400).json({ success: false, message: 'กรุณาระบุ student_id และ course_id' });

  const total = (attend_score||0) + (attitude_score||0) + (homework_score||0)
              + (midterm_score||0) + (final_score||0) + (quiz_score||0);

  const grade_letter =
    total >= 80 ? 'A'  : total >= 75 ? 'B+' : total >= 70 ? 'B'  :
    total >= 65 ? 'C+' : total >= 60 ? 'C'  : total >= 55 ? 'D+' :
    total >= 50 ? 'D'  : 'F';

  try {
    await query(`
      INSERT INTO Grade
        (student_id, course_id, attend_score, attitude_score, homework_score,
         midterm_score, final_score, quiz_score, total_score, grade_letter)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        attend_score   = VALUES(attend_score),
        attitude_score = VALUES(attitude_score),
        homework_score = VALUES(homework_score),
        midterm_score  = VALUES(midterm_score),
        final_score    = VALUES(final_score),
        quiz_score     = VALUES(quiz_score),
        total_score    = VALUES(total_score),
        grade_letter   = VALUES(grade_letter)
    `, [student_id, course_id,
        attend_score||0, attitude_score||0, homework_score||0,
        midterm_score||0, final_score||0, quiz_score||0, total, grade_letter]);
    res.json({ success: true, message: 'บันทึกคะแนนสำเร็จ ✓', grade: grade_letter, total });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// ATTENDANCE ANALYSIS
// ═══════════════════════════════════════════════════════════

app.get('/api/attendance/:student_id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM AttendanceAnalysis WHERE student_id = ?', [req.params.student_id]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/attendance/risk/all', async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM AttendanceAnalysis WHERE risk_level != 'Low' ORDER BY attendance_rate ASC");
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// STUDENT INFO
// ═══════════════════════════════════════════════════════════

app.get('/api/student/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT s.student_id, s.name AS student_name, u.username, u.role
      FROM Student s
      JOIN Users u ON s.student_id = u.user_id
      WHERE s.student_id = ?
    `, [req.params.student_id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบนักศึกษา' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// NFC CHECK-IN  (check_in_time, start_time, day_of_week)
// ═══════════════════════════════════════════════════════════

app.post('/api/attendance/nfc', async (req, res) => {
  const { student_id, date, checkin_time, source } = req.body;
  if (!student_id || !date || !checkin_time)
    return res.status(400).json({ success: false, message: 'กรุณาส่ง student_id, date และ checkin_time' });

  try {
    const stuRows = await query(
      'SELECT student_id, name FROM Student WHERE student_id = ?', [student_id]);
    if (!stuRows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบนักศึกษา ' + student_id });
    const student = stuRows[0];

    const dayTh = DAY_TH[new Date(date).getDay()];

    const schedRows = await query(`
      SELECT sc.schedule_id, sc.course_id, sc.start_time
      FROM Schedule sc
      JOIN Enrollment e ON e.course_id = sc.course_id
      WHERE e.student_id = ? AND sc.day_of_week = ?
      ORDER BY sc.start_time
      LIMIT 1
    `, [student_id, dayTh]);

    let scheduleId = null, classStart = null, isLate = false, minsLate = 0;

    if (schedRows.length > 0) {
      scheduleId = schedRows[0].schedule_id;
      classStart = schedRows[0].start_time;
      const startStr = String(classStart).substring(0, 5);
      minsLate = minutesLate(checkin_time, startStr);
      isLate   = minsLate > 15;
    }

    const status = isLate ? 'late' : 'present';

    if (scheduleId) {
      await query(`
        INSERT INTO Attendance (student_id, schedule_id, attendance_date, check_in_time, status)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          check_in_time = VALUES(check_in_time),
          status        = VALUES(status)
      `, [student_id, scheduleId, date, checkin_time, status]);

      const courseId = schedRows[0].course_id;
      await updateAttendanceAnalysis(student_id, courseId);
    }

    res.json({
      success: true,
      message: isLate ? `มาสาย ${minsLate} นาที` : 'มาทัน',
      data: {
        student_id,
        student_name:     student.name,
        checkin_time,
        class_start_time: classStart,
        status,
        is_late:          isLate,
        minutes_late:     Math.max(0, minsLate),
        source:           source || 'nfc',
        date
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Helper: คำนวณและ upsert AttendanceAnalysis
async function updateAttendanceAnalysis(student_id, course_id) {
  try {
    const stats = await query(`
      SELECT
        COUNT(*)                                               AS total,
        SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END)   AS absent_c,
        SUM(CASE WHEN a.status='late'    THEN 1 ELSE 0 END)   AS late_c,
        ROUND(SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END)/COUNT(*)*100,2) AS rate
      FROM Attendance a
      JOIN Schedule sc ON a.schedule_id = sc.schedule_id
      WHERE a.student_id = ? AND sc.course_id = ?
    `, [student_id, course_id]);

    const { total, absent_c, late_c, rate } = stats[0];
    const risk = rate >= 85 ? 'Low' : rate >= 80 ? 'Medium' : 'High';

    await query(`
      INSERT INTO AttendanceAnalysis
        (student_id, course_id, total_classes, absent_count, late_count, attendance_rate, risk_level)
      VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        total_classes   = VALUES(total_classes),
        absent_count    = VALUES(absent_count),
        late_count      = VALUES(late_count),
        attendance_rate = VALUES(attendance_rate),
        risk_level      = VALUES(risk_level)
    `, [student_id, course_id, total, absent_c, late_c, rate, risk]);
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════
// ATTENDANCE LOG (Teacher/Admin)
// ═══════════════════════════════════════════════════════════

app.get('/api/attendance/log/:course_id', async (req, res) => {
  const { course_id } = req.params;
  const date = req.query.date;
  if (!date) return res.status(400).json({ success: false, message: 'กรุณาส่ง ?date=YYYY-MM-DD' });

  try {
    const dayTh = DAY_TH[new Date(date).getDay()];

    const schedInfo = await query(
      'SELECT schedule_id, start_time FROM Schedule WHERE course_id = ? AND day_of_week = ? LIMIT 1',
      [course_id, dayTh]);
    const classStart = schedInfo.length ? String(schedInfo[0].start_time).substring(0, 5) : null;
    const scheduleId = schedInfo.length ? schedInfo[0].schedule_id : null;

    const rows = await query(`
      SELECT
        s.student_id,
        s.name AS student_name,
        a.check_in_time,
        IFNULL(a.status, 'absent') AS status,
        CASE
          WHEN a.check_in_time IS NOT NULL THEN
            GREATEST(0, ROUND(
              (TIME_TO_SEC(a.check_in_time) - TIME_TO_SEC(?)) / 60
            ))
          ELSE 0
        END AS minutes_late
      FROM Enrollment e
      JOIN Student s ON s.student_id = e.student_id
      LEFT JOIN Attendance a
             ON a.student_id      = s.student_id
            AND a.schedule_id     = ?
            AND a.attendance_date = ?
      WHERE e.course_id = ?
      ORDER BY FIELD(IFNULL(a.status,'absent'),'absent','late','present'), a.check_in_time ASC
    `, [classStart || '00:00:00', scheduleId || 0, date, course_id]);

    res.json({
      success: true, course_id, date, count: rows.length,
      data: rows.map(r => ({
        student_id:       r.student_id,
        student_name:     r.student_name,
        checkin_time:     r.check_in_time || null,
        class_start_time: classStart,
        status:           r.status,
        minutes_late:     Math.round(Number(r.minutes_late) || 0)
      }))
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// MY ATTENDANCE HISTORY (นักศึกษา)
// ═══════════════════════════════════════════════════════════

app.get('/api/attendance/myhistory/:student_id', async (req, res) => {
  const { student_id } = req.params;
  const course_filter  = req.query.course || null;

  try {
    let sql = `
      SELECT
        a.attendance_date,
        a.check_in_time,
        a.status,
        TIME_FORMAT(sc.start_time,'%H:%i') AS class_start_time,
        sc.day_of_week,
        c.course_id,
        c.course_name,
        CASE
          WHEN a.check_in_time IS NOT NULL AND a.status = 'late' THEN
            GREATEST(0, ROUND(
              (TIME_TO_SEC(a.check_in_time) - TIME_TO_SEC(sc.start_time)) / 60
            ))
          ELSE 0
        END AS minutes_late
      FROM Attendance a
      JOIN Schedule sc ON a.schedule_id = sc.schedule_id
      JOIN Course   c  ON sc.course_id  = c.course_id
      WHERE a.student_id = ?
    `;
    const params = [student_id];

    if (course_filter) {
      sql += ' AND sc.course_id = ?';
      params.push(course_filter);
    }
    sql += ' ORDER BY a.attendance_date DESC, a.check_in_time DESC';

    const rows = await query(sql, params);
    res.json({
      success: true, student_id, count: rows.length,
      data: rows.map(r => ({
        attendance_date:  r.attendance_date,
        course_id:        r.course_id,
        course_name:      r.course_name,
        class_start_time: r.class_start_time || null,
        day_of_week:      r.day_of_week,
        checkin_time:     r.check_in_time ? String(r.check_in_time).substring(0,8) : null,
        status:           r.status,
        minutes_late:     Number(r.minutes_late) || 0
      }))
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── Static files + fallback (AFTER all API routes) ──────
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Global error handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('EXPRESS ERROR:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// ─── Start Server ─────────────────────────────────────────
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server รันอยู่ที่ http://0.0.0.0:${port}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;
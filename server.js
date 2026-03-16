const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const mysql = require('mysql2');

const port = process.env.PORT || 3000;

// ─── MySQL ────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'smart_classroom',
  port: parseInt(process.env.MYSQLPORT) || 3306,
  waitForConnections: true, connectionLimit: 10, enableKeepAlive: true
}).promise();
pool.getConnection().then(c=>{console.log('DB OK');c.release();}).catch(e=>console.error('DB ERR:',e.message));
const query = (sql,p=[]) => pool.query(sql,p).then(([r])=>r);
const DAY_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์'];
function minutesLate(a,b){if(!a||!b)return 0;const[h1,m1]=String(a).split(':').map(Number);const[h2,m2]=String(b).split(':').map(Number);return(h1*60+m1)-(h2*60+m2);}

// ─── Read index.html once ─────────────────────────────────
const indexPath = path.join(__dirname, 'index.html');
let indexHtml = '';
try { indexHtml = fs.readFileSync(indexPath, 'utf8'); } catch(e) { indexHtml = '<h1>index.html not found</h1>'; }

// ─── Parse JSON body ──────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
  });
}

// ─── Send JSON helper ─────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(data));
}

// ─── SETUP (create all tables) ────────────────────────────
async function setupDB() {
  const c = await pool.getConnection();
  await c.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['Submission','AttendanceAnalysis','Attendance','Grade','Score','Assignment','Schedule','Enrollment','Course','Classroom','Student','Teacher','Admin','Users','User'])
    await c.query(`DROP TABLE IF EXISTS \`${t}\``);
  await c.query('DROP VIEW IF EXISTS GradeView');
  await c.query('SET FOREIGN_KEY_CHECKS=1');
  await c.query("CREATE TABLE Users(user_id VARCHAR(20) NOT NULL,username VARCHAR(100) NOT NULL UNIQUE,password VARCHAR(255) NOT NULL,role ENUM('admin','teacher','student') NOT NULL,email VARCHAR(200),created_at DATETIME DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id))");
  await c.query("CREATE TABLE Admin(admin_id VARCHAR(20) NOT NULL,full_name VARCHAR(100),phone VARCHAR(20),email VARCHAR(200),PRIMARY KEY(admin_id),FOREIGN KEY(admin_id) REFERENCES Users(user_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE Teacher(teacher_id VARCHAR(20) NOT NULL,name VARCHAR(100) NOT NULL,department VARCHAR(150),phone VARCHAR(20),email VARCHAR(200),PRIMARY KEY(teacher_id),FOREIGN KEY(teacher_id) REFERENCES Users(user_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE Student(student_id VARCHAR(20) NOT NULL,name VARCHAR(100) NOT NULL,email VARCHAR(200),phone VARCHAR(20),gender ENUM('male','female','other'),PRIMARY KEY(student_id),FOREIGN KEY(student_id) REFERENCES Users(user_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE Classroom(room_id VARCHAR(20) NOT NULL,room_name VARCHAR(100) NOT NULL,capacity INT DEFAULT 40,floor INT,room_type VARCHAR(50),PRIMARY KEY(room_id))");
  await c.query("CREATE TABLE Course(course_id VARCHAR(20) NOT NULL,course_code VARCHAR(20),course_name VARCHAR(200) NOT NULL,credit INT DEFAULT 3,semester INT DEFAULT 1,academic_year INT DEFAULT 2568,teacher_id VARCHAR(20) NOT NULL,PRIMARY KEY(course_id),FOREIGN KEY(teacher_id) REFERENCES Teacher(teacher_id))");
  await c.query("CREATE TABLE Enrollment(enrollment_id INT AUTO_INCREMENT,student_id VARCHAR(20) NOT NULL,course_id VARCHAR(20) NOT NULL,PRIMARY KEY(enrollment_id),UNIQUE KEY uq(student_id,course_id),FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE,FOREIGN KEY(course_id) REFERENCES Course(course_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE Schedule(schedule_id INT AUTO_INCREMENT,course_id VARCHAR(20) NOT NULL,room_id VARCHAR(20) NOT NULL,day_of_week VARCHAR(20) NOT NULL,start_time TIME NOT NULL,end_time TIME NOT NULL,study_hours DECIMAL(4,1) DEFAULT 2,semester INT DEFAULT 1,academic_year INT DEFAULT 2568,PRIMARY KEY(schedule_id),FOREIGN KEY(course_id) REFERENCES Course(course_id) ON DELETE CASCADE,FOREIGN KEY(room_id) REFERENCES Classroom(room_id))");
  await c.query("CREATE TABLE Attendance(attendance_id INT AUTO_INCREMENT,student_id VARCHAR(20) NOT NULL,course_id VARCHAR(20) NOT NULL,attendance_date DATE NOT NULL,check_in_time TIME,status ENUM('present','absent','late','excused') DEFAULT 'absent',academic_year INT DEFAULT 2568,PRIMARY KEY(attendance_id),UNIQUE KEY uq(student_id,course_id,attendance_date),FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE,FOREIGN KEY(course_id) REFERENCES Course(course_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE AttendanceAnalysis(analysis_id INT AUTO_INCREMENT,student_id VARCHAR(20) NOT NULL,total_classes INT DEFAULT 0,absent_count INT DEFAULT 0,late_count INT DEFAULT 0,attendance_rate DECIMAL(5,2) DEFAULT 0,risk_level ENUM('Low','Medium','High') DEFAULT 'Low',PRIMARY KEY(analysis_id),UNIQUE KEY uq(student_id),FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE Grade(grade_id INT AUTO_INCREMENT,student_id VARCHAR(20) NOT NULL,course_id VARCHAR(20) NOT NULL,grade_letter VARCHAR(5),semester INT DEFAULT 1,academic_year INT DEFAULT 2568,PRIMARY KEY(grade_id),UNIQUE KEY uq(student_id,course_id),FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE,FOREIGN KEY(course_id) REFERENCES Course(course_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE Assignment(assignment_id INT AUTO_INCREMENT,course_id VARCHAR(20) NOT NULL,title VARCHAR(200) NOT NULL,due_date DATETIME NOT NULL,max_score DECIMAL(5,2) DEFAULT 100,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(assignment_id),FOREIGN KEY(course_id) REFERENCES Course(course_id) ON DELETE CASCADE)");
  await c.query("CREATE TABLE Submission(submission_id INT AUTO_INCREMENT,assignment_id INT NOT NULL,student_id VARCHAR(20) NOT NULL,score DECIMAL(5,2),submit_date DATETIME DEFAULT CURRENT_TIMESTAMP,graded_date DATETIME,graded_by VARCHAR(20),status ENUM('submitted','graded','late') DEFAULT 'submitted',PRIMARY KEY(submission_id),UNIQUE KEY uq(assignment_id,student_id),FOREIGN KEY(assignment_id) REFERENCES Assignment(assignment_id) ON DELETE CASCADE,FOREIGN KEY(student_id) REFERENCES Student(student_id) ON DELETE CASCADE)");
  await c.query("CREATE VIEW GradeView AS SELECT g.grade_id,g.student_id,s.name AS student_name,g.course_id,c.course_name,g.grade_letter AS grade,g.semester,g.academic_year FROM Grade g JOIN Student s ON g.student_id=s.student_id JOIN Course c ON g.course_id=c.course_id");
  await c.query("INSERT INTO Users VALUES('ADM001','admin','admin1234','admin','admin@kku.ac.th',NOW()),('TCH001','teacher1','teach1234','teacher','t1@kku.ac.th',NOW()),('TCH002','teacher2','teach5678','teacher','t2@kku.ac.th',NOW()),('683380495-2','saksorn','1234','student','s@kku.com',NOW()),('683380495-3','somchai','1234','student','s2@kku.com',NOW()),('683380495-4','somsri','1234','student','s3@kku.com',NOW()),('683380495-5','anucha','1234','student','s4@kku.com',NOW()),('683380495-6','wichai','1234','student','s5@kku.com',NOW()),('683380495-7','malai','1234','student','s6@kku.com',NOW())");
  await c.query("INSERT INTO Admin VALUES('ADM001','Admin','043-000','admin@kku.ac.th')");
  await c.query("INSERT INTO Teacher VALUES('TCH001','อ.ดร.วิชัย สอนดี','CS','043-101','t1@kku.ac.th'),('TCH002','อ.มาลี รักสอน','CS','043-102','t2@kku.ac.th')");
  await c.query("INSERT INTO Student(student_id,name) VALUES('683380495-2','ศักย์ศรณ์ พละศักดิ์'),('683380495-3','สมชาย ใจดี'),('683380495-4','สมศรี รักเรียน'),('683380495-5','อนุชา มานะดี'),('683380495-6','วิชัย สุขใจ'),('683380495-7','มาลี งามดี')");
  await c.query("INSERT INTO Classroom VALUES('SC5102','SC5102',50,5,'บรรยาย'),('GL149','GL149',80,1,'บรรยาย'),('CP9127','CP9127',40,1,'ปฏิบัติ'),('SC9107','SC9107',60,9,'บรรยาย'),('SC6201','SC6201',50,2,'ปฏิบัติ'),('SC1103','ตึกกลม',60,1,'บรรยาย'),('SC9227','SC9227',40,2,'ปฏิบัติ'),('GL213','GL213',80,2,'บรรยาย')");
  await c.query("INSERT INTO Course(course_id,course_code,course_name,credit,semester,academic_year,teacher_id) VALUES('SC602005','SC602005','ความน่าจะเป็นและสถิติ',3,1,2568,'TCH001'),('LI101001','LI101001','ภาษาอังกฤษ 1',3,1,2568,'TCH002'),('CP411106','CP411106','Programming for ML',3,1,2568,'TCH001'),('SC401201','SC401201','แคลคูลัส 1',3,1,2568,'TCH001'),('CP411105','CP411105','ระบบคอมพิวเตอร์',3,1,2568,'TCH001'),('CP411701','CP411701','AI Inspiration',2,1,2568,'TCH002'),('GE341511','GE341511','การคิดเชิงคำนวณและสถิติ',3,1,2568,'TCH002')");
  await c.query("INSERT INTO Schedule(course_id,room_id,day_of_week,start_time,end_time,study_hours) VALUES('SC602005','SC5102','จันทร์','10:00','12:00',2),('SC602005','SC5102','พุธ','10:00','12:00',2),('LI101001','GL149','อังคาร','09:00','10:00',1),('LI101001','GL149','พฤหัสฯ','09:00','10:00',1),('CP411106','CP9127','อังคาร','13:00','15:00',2),('CP411106','SC9227','พฤหัสฯ','15:00','17:00',2),('SC401201','SC9107','อังคาร','16:00','18:00',2),('SC401201','SC9107','พฤหัสฯ','16:00','18:00',2),('CP411105','SC6201','พุธ','13:00','15:00',2),('CP411701','SC1103','พฤหัสฯ','10:00','12:00',2),('GE341511','GL213','ศุกร์','13:00','15:00',2)");
  await c.query("INSERT INTO Enrollment(student_id,course_id) SELECT s.student_id,c.course_id FROM Student s CROSS JOIN Course c");
  await c.query("INSERT INTO Attendance(student_id,course_id,attendance_date,check_in_time,status) VALUES('683380495-2','SC602005','2026-02-02','10:03','present'),('683380495-2','SC602005','2026-02-09','10:18','late'),('683380495-2','SC602005','2026-02-16','10:05','present'),('683380495-2','SC602005','2026-02-23',NULL,'absent'),('683380495-2','LI101001','2026-02-03','09:02','present'),('683380495-2','CP411106','2026-02-03','13:05','present'),('683380495-2','CP411105','2026-02-04','13:10','present'),('683380495-2','GE341511','2026-02-06','13:05','present')");
  await c.query("INSERT INTO AttendanceAnalysis(student_id,total_classes,absent_count,late_count,attendance_rate,risk_level) VALUES('683380495-2',8,1,1,87.50,'Low'),('683380495-3',8,2,2,50.00,'High'),('683380495-4',8,0,0,100.00,'Low'),('683380495-5',8,3,2,37.50,'High'),('683380495-6',8,1,1,75.00,'Medium'),('683380495-7',8,0,0,100.00,'Low')");
  await c.query("INSERT INTO Grade(student_id,course_id,grade_letter) VALUES('683380495-2','SC602005','A'),('683380495-2','LI101001','A'),('683380495-2','CP411106','A'),('683380495-2','SC401201','B+'),('683380495-2','CP411105','A'),('683380495-2','CP411701','B'),('683380495-2','GE341511','B+'),('683380495-3','SC602005','B'),('683380495-3','LI101001','C+'),('683380495-3','CP411106','B+'),('683380495-3','SC401201','C+'),('683380495-3','CP411105','B'),('683380495-3','CP411701','C+'),('683380495-3','GE341511','B'),('683380495-4','SC602005','A'),('683380495-4','LI101001','A'),('683380495-4','CP411106','A'),('683380495-4','SC401201','A'),('683380495-4','CP411105','A'),('683380495-4','CP411701','B+'),('683380495-4','GE341511','A'),('683380495-5','SC602005','C'),('683380495-5','LI101001','B'),('683380495-5','CP411106','B+'),('683380495-5','SC401201','D+'),('683380495-5','CP411105','C'),('683380495-5','CP411701','D'),('683380495-5','GE341511','C'),('683380495-6','SC602005','B+'),('683380495-6','LI101001','A'),('683380495-6','CP411106','B+'),('683380495-6','SC401201','B+'),('683380495-6','CP411105','B+'),('683380495-6','CP411701','B'),('683380495-6','GE341511','B+'),('683380495-7','SC602005','A'),('683380495-7','LI101001','A'),('683380495-7','CP411106','A'),('683380495-7','SC401201','B+'),('683380495-7','CP411105','A'),('683380495-7','CP411701','B+'),('683380495-7','GE341511','B+')");
  c.release();
}

// ─── HTTP Server (ไม่ใช้ Express เลย) ─────────────────────
const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;

  try {
    // ── Health ──
    if (p === '/api/health') return json(res, 200, { ok: true });

    // ── Setup ──
    if (p === '/api/setup') {
      await setupDB();
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      return res.end('<h1 style="color:green;font-family:sans-serif">✅ Database setup สำเร็จ!</h1><a href="/">← กลับหน้าเว็บ</a>');
    }

    // ── Login ──
    if (p === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const rows = await query('SELECT * FROM Users WHERE username=? AND password=?', [body.username, body.password]);
      if (!rows.length) return json(res, 401, {success:false, message:'ไม่ถูกต้อง'});
      const u = rows[0]; let name = u.username;
      if (u.role==='student'){const s=await query('SELECT name FROM Student WHERE student_id=?',[u.user_id]);if(s.length)name=s[0].name;}
      if (u.role==='teacher'){const t=await query('SELECT name FROM Teacher WHERE teacher_id=?',[u.user_id]);if(t.length)name=t[0].name;}
      if (u.role==='admin'){const a=await query('SELECT full_name FROM Admin WHERE admin_id=?',[u.user_id]);if(a.length&&a[0].full_name)name=a[0].full_name;}
      return json(res, 200, {success:true, user_id:u.user_id, username:u.username, role:u.role, name});
    }

    // ── Register ──
    if (p === '/api/register' && req.method === 'POST') {
      const b = await parseBody(req);
      if (!b.username||!b.password||!b.firstname||!b.lastname||!b.email) return json(res, 400, {success:false,message:'กรอกข้อมูลให้ครบ'});
      const ex = await query('SELECT user_id FROM Users WHERE username=?',[b.username]);
      if (ex.length) return json(res, 409, {success:false,message:'Username มีแล้ว'});
      let id = b.student_id&&b.student_id.trim() ? b.student_id.trim() : null;
      if (!id){const pfx=b.role==='teacher'?'TCH':b.role==='admin'?'ADM':'STU';const c=await query('SELECT COUNT(*) AS n FROM Users WHERE role=?',[b.role||'student']);id=pfx+String(c[0].n+1).padStart(3,'0');}
      const fn=b.firstname.trim()+' '+b.lastname.trim();
      const role=b.role||'student';
      await query('INSERT INTO Users(user_id,username,password,role,email) VALUES(?,?,?,?,?)',[id,b.username,b.password,role,b.email]);
      if(role==='student')await query('INSERT INTO Student(student_id,name) VALUES(?,?)',[id,fn]);
      if(role==='teacher')await query('INSERT INTO Teacher(teacher_id,name) VALUES(?,?)',[id,fn]);
      if(role==='admin')await query('INSERT INTO Admin(admin_id,full_name) VALUES(?,?)',[id,fn]);
      return json(res, 200, {success:true,message:'สำเร็จ',user_id:id,name:fn});
    }

    // ── Grades ──
    const gradesMatch = p.match(/^\/api\/grades\/(.+)$/);
    if (gradesMatch && req.method==='GET') {
      const r = await query('SELECT * FROM GradeView WHERE student_id=?',[gradesMatch[1]]);
      return json(res, 200, {success:true, data:r});
    }

    // ── Schedule ──
    const schedMatch = p.match(/^\/api\/schedule\/(.+)$/);
    if (schedMatch && req.method==='GET') {
      const r = await query("SELECT sc.day_of_week AS day,CONCAT(TIME_FORMAT(sc.start_time,'%H:%i'),'-',TIME_FORMAT(sc.end_time,'%H:%i')) AS time,c.course_id AS code,c.course_name AS name,t.name AS teacher,cr.room_name AS room FROM Enrollment e JOIN Course c ON e.course_id=c.course_id JOIN Schedule sc ON c.course_id=sc.course_id JOIN Teacher t ON c.teacher_id=t.teacher_id JOIN Classroom cr ON sc.room_id=cr.room_id WHERE e.student_id=? ORDER BY FIELD(sc.day_of_week,'จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์'),sc.start_time",[schedMatch[1]]);
      return json(res, 200, {success:true, data:r});
    }

    // ── Score GET ──
    const scoreMatch = p.match(/^\/api\/score\/(.+)$/);
    if (scoreMatch && req.method==='GET') {
      const r = await query('SELECT g.*,s.name AS student_name,c.course_name FROM Grade g JOIN Student s ON g.student_id=s.student_id JOIN Course c ON g.course_id=c.course_id WHERE g.student_id=?',[scoreMatch[1]]);
      return json(res, 200, {success:true, data:r[0]||null});
    }

    // ── Score POST ──
    if (p === '/api/score' && req.method==='POST') {
      const b = await parseBody(req);
      if(!b.student_id||!b.course_id||!b.grade_letter) return json(res,400,{success:false,message:'ข้อมูลไม่ครบ'});
      await query('INSERT INTO Grade(student_id,course_id,grade_letter) VALUES(?,?,?) ON DUPLICATE KEY UPDATE grade_letter=VALUES(grade_letter)',[b.student_id,b.course_id,b.grade_letter]);
      return json(res, 200, {success:true,grade:b.grade_letter});
    }

    // ── Attendance risk ──
    if (p === '/api/attendance/risk/all') {
      return json(res, 200, {success:true, data:await query("SELECT * FROM AttendanceAnalysis WHERE risk_level!='Low'")});
    }

    // ── Attendance log ──
    const logMatch = p.match(/^\/api\/attendance\/log\/(.+)$/);
    if (logMatch && req.method==='GET') {
      const d=parsed.query.date; if(!d)return json(res,400,{success:false,message:'need date'});
      const sc=await query('SELECT start_time FROM Schedule WHERE course_id=? LIMIT 1',[logMatch[1]]);
      const cs=sc.length?String(sc[0].start_time).substring(0,5):null;
      const rows=await query('SELECT s.student_id,s.name AS student_name,a.check_in_time,IFNULL(a.status,"absent") AS status FROM Enrollment e JOIN Student s ON s.student_id=e.student_id LEFT JOIN Attendance a ON a.student_id=s.student_id AND a.course_id=? AND a.attendance_date=? WHERE e.course_id=?',[logMatch[1],d,logMatch[1]]);
      return json(res,200,{success:true,data:rows.map(r=>({student_id:r.student_id,student_name:r.student_name,checkin_time:r.check_in_time,class_start_time:cs,status:r.status,minutes_late:0}))});
    }

    // ── My attendance history ──
    const histMatch = p.match(/^\/api\/attendance\/myhistory\/(.+)$/);
    if (histMatch && req.method==='GET') {
      let sql="SELECT a.attendance_id,a.attendance_date,a.check_in_time,a.status,a.academic_year,a.student_id,a.course_id,c.course_name FROM Attendance a JOIN Course c ON a.course_id=c.course_id WHERE a.student_id=?";
      const params=[histMatch[1]]; if(parsed.query.course){sql+=' AND a.course_id=?';params.push(parsed.query.course);} sql+=' ORDER BY a.attendance_date DESC';
      const rows=await query(sql,params);
      return json(res,200,{success:true,count:rows.length,data:rows});
    }

    // ── Attendance by student ──
    const attMatch = p.match(/^\/api\/attendance\/(.+)$/);
    if (attMatch && req.method==='GET') {
      return json(res,200,{success:true,data:await query('SELECT * FROM AttendanceAnalysis WHERE student_id=?',[attMatch[1]])});
    }

    // ── Student info ──
    const stuMatch = p.match(/^\/api\/student\/(.+)$/);
    if (stuMatch && req.method==='GET') {
      const r=await query('SELECT s.student_id,s.name AS student_name,u.username,u.role FROM Student s JOIN Users u ON s.student_id=u.user_id WHERE s.student_id=?',[stuMatch[1]]);
      return json(res,200,{success:true,data:r[0]||null});
    }

    // ── NFC checkin ──
    if (p === '/api/attendance/nfc' && req.method==='POST') {
      const b = await parseBody(req);
      if(!b.student_id||!b.date||!b.checkin_time) return json(res,400,{success:false,message:'ข้อมูลไม่ครบ'});
      const stu=await query('SELECT student_id,name FROM Student WHERE student_id=?',[b.student_id]);
      if(!stu.length) return json(res,404,{success:false,message:'ไม่พบ'});
      const dayTh=DAY_TH[new Date(b.date).getDay()];
      const sc=await query('SELECT sc.course_id,sc.start_time FROM Schedule sc JOIN Enrollment e ON e.course_id=sc.course_id WHERE e.student_id=? AND sc.day_of_week=? LIMIT 1',[b.student_id,dayTh]);
      let cid=null,cs=null,late=false,ml=0;
      if(sc.length){cid=sc[0].course_id;cs=sc[0].start_time;ml=minutesLate(b.checkin_time,String(cs).substring(0,5));late=ml>15;}
      if(cid)await query('INSERT INTO Attendance(student_id,course_id,attendance_date,check_in_time,status) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE check_in_time=VALUES(check_in_time),status=VALUES(status)',[b.student_id,cid,b.date,b.checkin_time,late?'late':'present']);
      return json(res,200,{success:true,message:late?'มาสาย '+ml+' นาที':'มาทัน',data:{student_id:b.student_id,student_name:stu[0].name,checkin_time:b.checkin_time,class_start_time:cs,status:late?'late':'present',is_late:late,minutes_late:Math.max(0,ml),source:b.source||'nfc',date:b.date}});
    }

    // ── Grade Management (Teacher/Admin) ──
    if (p==='/api/grades/bycourse') {
      const courses = await query('SELECT c.course_id,c.course_name,t.name AS teacher_name FROM Course c JOIN Teacher t ON c.teacher_id=t.teacher_id ORDER BY c.course_id');
      const result = [];
      for (const c of courses) {
        const students = await query("SELECT g.student_id,s.name AS student_name,g.grade_letter,g.semester,g.academic_year FROM Grade g JOIN Student s ON g.student_id=s.student_id WHERE g.course_id=? ORDER BY g.grade_letter,g.student_id",[c.course_id]);
        const enrolled = await query("SELECT COUNT(*) AS cnt FROM Enrollment WHERE course_id=?",[c.course_id]);
        result.push({...c, enrolled: enrolled[0]?.cnt||0, graded: students.length, students});
      }
      return json(res,200,{success:true,data:result});
    }

    // ── LIST APIs (ER Entities ครบทุกตาราง) ──
    if (p==='/api/classrooms')  return json(res,200,{success:true,data:await query('SELECT * FROM Classroom ORDER BY room_id')});
    if (p==='/api/courses')     return json(res,200,{success:true,data:await query('SELECT c.*,t.name AS teacher_name FROM Course c LEFT JOIN Teacher t ON c.teacher_id=t.teacher_id ORDER BY c.course_id')});
    if (p==='/api/assignments') return json(res,200,{success:true,data:await query('SELECT a.*,c.course_name FROM Assignment a JOIN Course c ON a.course_id=c.course_id ORDER BY a.due_date')});
    if (p==='/api/submissions') return json(res,200,{success:true,data:await query("SELECT sb.*,a.title AS assignment_title,s.name AS student_name,c.course_name,t.name AS grader_name FROM Submission sb JOIN Assignment a ON sb.assignment_id=a.assignment_id JOIN Student s ON sb.student_id=s.student_id JOIN Course c ON a.course_id=c.course_id LEFT JOIN Teacher t ON sb.graded_by=t.teacher_id ORDER BY sb.submit_date DESC")});
    if (p==='/api/students')    return json(res,200,{success:true,data:await query('SELECT s.*,u.user_id FROM Student s JOIN Users u ON s.student_id=u.user_id ORDER BY s.student_id')});
    if (p==='/api/teachers')    return json(res,200,{success:true,data:await query('SELECT t.*,u.user_id FROM Teacher t JOIN Users u ON t.teacher_id=u.user_id ORDER BY t.teacher_id')});
    if (p==='/api/enrollments') return json(res,200,{success:true,data:await query('SELECT e.enrollment_id,e.student_id,s.name AS student_name,e.course_id,c.course_name FROM Enrollment e JOIN Student s ON e.student_id=s.student_id JOIN Course c ON e.course_id=c.course_id ORDER BY e.course_id,e.student_id')});
    if (p==='/api/analysis')    return json(res,200,{success:true,data:await query('SELECT aa.*,s.name AS student_name FROM AttendanceAnalysis aa JOIN Student s ON aa.student_id=s.student_id ORDER BY aa.risk_level DESC,aa.attendance_rate')});
    if (p==='/api/schedules')   return json(res,200,{success:true,data:await query("SELECT sc.*,c.course_name,cr.room_name,CONCAT(TIME_FORMAT(sc.start_time,'%H:%i'),'-',TIME_FORMAT(sc.end_time,'%H:%i')) AS time_range FROM Schedule sc JOIN Course c ON sc.course_id=c.course_id JOIN Classroom cr ON sc.room_id=cr.room_id ORDER BY FIELD(sc.day_of_week,'จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์'),sc.start_time")});
    if (p==='/api/grades')      return json(res,200,{success:true,data:await query('SELECT * FROM GradeView ORDER BY student_id,course_id')});
    if (p==='/api/users')       return json(res,200,{success:true,data:await query("SELECT user_id,username,password,email,role,created_at FROM Users ORDER BY FIELD(role,'admin','teacher','student'),user_id")});

    // ── Serve index.html ──
    if (p === '/' || p === '/index.html') {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      return res.end(indexHtml);
    }

    // ── 404 ──
    res.writeHead(404); res.end('Not Found');

  } catch(e) {
    console.error('ERROR:', e.message);
    json(res, 500, {success:false, message:e.message});
  }
});

server.listen(port, '0.0.0.0', () => console.log('SERVER OK on port ' + port));

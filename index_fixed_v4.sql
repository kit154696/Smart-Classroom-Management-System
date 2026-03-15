-- =====================================================
-- Smart Classroom Management System
-- Database: MySQL 8.0+  |  ✅ v4 — ตรงกับ ER Diagram
-- =====================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS Submission;
DROP TABLE IF EXISTS AttendanceAnalysis;
DROP TABLE IF EXISTS Attendance;
DROP TABLE IF EXISTS Grade;
DROP TABLE IF EXISTS Score;
DROP TABLE IF EXISTS Assignment;
DROP TABLE IF EXISTS Schedule;
DROP TABLE IF EXISTS Enrollment;
DROP TABLE IF EXISTS Course;
DROP TABLE IF EXISTS Classroom;
DROP TABLE IF EXISTS Student;
DROP TABLE IF EXISTS Teacher;
DROP TABLE IF EXISTS Admin;
DROP TABLE IF EXISTS Users;
DROP VIEW  IF EXISTS GradeView;
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- 1. USERS
-- =====================================================
CREATE TABLE Users (
  user_id     VARCHAR(20)  NOT NULL,
  username    VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin','teacher','student') NOT NULL,
  email       VARCHAR(200) NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;

-- =====================================================
-- 2. ADMIN
-- =====================================================
CREATE TABLE Admin (
  admin_id   VARCHAR(20)  NOT NULL,
  full_name  VARCHAR(100) NULL,
  phone      VARCHAR(20)  NULL,
  email      VARCHAR(200) NULL,
  PRIMARY KEY (admin_id),
  FOREIGN KEY (admin_id) REFERENCES Users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 3. TEACHER
-- =====================================================
CREATE TABLE Teacher (
  teacher_id  VARCHAR(20)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  department  VARCHAR(150) NULL,
  phone       VARCHAR(20)  NULL,
  email       VARCHAR(200) NULL,
  PRIMARY KEY (teacher_id),
  FOREIGN KEY (teacher_id) REFERENCES Users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 4. STUDENT
-- =====================================================
CREATE TABLE Student (
  student_id  VARCHAR(20)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(200) NULL,
  phone       VARCHAR(20)  NULL,
  gender      ENUM('male','female','other') NULL,
  PRIMARY KEY (student_id),
  FOREIGN KEY (student_id) REFERENCES Users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 5. CLASSROOM
-- =====================================================
CREATE TABLE Classroom (
  room_id    VARCHAR(20)  NOT NULL,
  room_name  VARCHAR(100) NOT NULL,
  capacity   INT          NOT NULL DEFAULT 40,
  floor      INT          NULL,
  room_type  VARCHAR(50)  NULL,
  PRIMARY KEY (room_id)
) ENGINE=InnoDB;

-- =====================================================
-- 6. COURSE
-- =====================================================
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
) ENGINE=InnoDB;

-- =====================================================
-- 7. ENROLLMENT (M:N Student-Course)
-- =====================================================
CREATE TABLE Enrollment (
  enrollment_id  INT         NOT NULL AUTO_INCREMENT,
  student_id     VARCHAR(20) NOT NULL,
  course_id      VARCHAR(20) NOT NULL,
  enrolled_at    DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (enrollment_id),
  UNIQUE KEY uq_enroll (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES Student(student_id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES Course(course_id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 8. SCHEDULE
-- =====================================================
CREATE TABLE Schedule (
  schedule_id   INT         NOT NULL AUTO_INCREMENT,
  course_id     VARCHAR(20) NOT NULL,
  room_id       VARCHAR(20) NOT NULL,
  day_of_week   ENUM('จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์','อาทิตย์') NOT NULL,
  start_time    TIME        NOT NULL,
  end_time      TIME        NOT NULL,
  study_hours   DECIMAL(4,1) DEFAULT 2.0,
  semester      INT          DEFAULT 1,
  academic_year INT          DEFAULT 2568,
  PRIMARY KEY (schedule_id),
  FOREIGN KEY (course_id) REFERENCES Course(course_id)   ON DELETE CASCADE,
  FOREIGN KEY (room_id)   REFERENCES Classroom(room_id)
) ENGINE=InnoDB;

-- =====================================================
-- 9. ATTENDANCE
-- =====================================================
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
) ENGINE=InnoDB;

-- =====================================================
-- 10. ATTENDANCE ANALYSIS (TABLE — ไม่ใช่ VIEW)
-- =====================================================
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
) ENGINE=InnoDB;

-- =====================================================
-- 11. GRADE (เกรดสุดท้าย)
-- =====================================================
CREATE TABLE Grade (
  grade_id       INT         NOT NULL AUTO_INCREMENT,
  student_id     VARCHAR(20) NOT NULL,
  course_id      VARCHAR(20) NOT NULL,
  grade_letter   VARCHAR(5)  NULL,       -- A, B+, B, C+, C, D+, D, F
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
) ENGINE=InnoDB;

-- =====================================================
-- 12. ASSIGNMENT
-- =====================================================
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
) ENGINE=InnoDB;

-- =====================================================
-- 13. SUBMISSION
-- =====================================================
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
) ENGINE=InnoDB;

-- =====================================================
-- VIEW: GradeView (backward-compatible — คำนวณจาก Grade)
-- =====================================================
CREATE VIEW GradeView AS
SELECT
  g.student_id,
  s.name        AS student_name,
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
JOIN Course  c ON g.course_id  = c.course_id;

-- =====================================================
-- ✅ SAMPLE DATA
-- =====================================================

-- ─── Users ────────────────────────────────────────
INSERT INTO Users (user_id, username, password, role, email) VALUES
('ADM001',       'admin',    'admin1234', 'admin',   'admin@kku.ac.th'),
('TCH001',       'teacher1', 'teach1234', 'teacher', 'teacher1@kku.ac.th'),
('TCH002',       'teacher2', 'teach5678', 'teacher', 'teacher2@kku.ac.th'),
('683380495-2',  'saksorn',  '1234',      'student', 'saksorn.p@kkumail.com'),
('683380495-3',  'somchai',  '1234',      'student', 'somchai@kkumail.com'),
('683380495-4',  'somsri',   '1234',      'student', 'somsri@kkumail.com'),
('683380495-5',  'anucha',   '1234',      'student', 'anucha@kkumail.com'),
('683380495-6',  'wichai',   '1234',      'student', 'wichai@kkumail.com'),
('683380495-7',  'malai',    '1234',      'student', 'malai@kkumail.com');

-- ─── Admin ────────────────────────────────────────
INSERT INTO Admin (admin_id, full_name, phone, email) VALUES
('ADM001', 'ผู้ดูแลระบบ', '043-000-001', 'admin@kku.ac.th');

-- ─── Teacher ──────────────────────────────────────
INSERT INTO Teacher (teacher_id, name, department, phone, email) VALUES
('TCH001', 'อ.ดร.วิชัย สอนดี', 'ภาควิชาวิทยาการคอมพิวเตอร์', '043-000-101', 'teacher1@kku.ac.th'),
('TCH002', 'อ.มาลี รักสอน',   'ภาควิชาวิทยาการคอมพิวเตอร์', '043-000-102', 'teacher2@kku.ac.th');

-- ─── Student ──────────────────────────────────────
INSERT INTO Student (student_id, name, email, phone, gender) VALUES
('683380495-2', 'ศักย์ศรณ์ พละศักดิ์',     'saksorn.p@kkumail.com',  '081-001-0001', 'male'),
('683380495-3', 'นายสมชาย ใจดี',           'somchai@kkumail.com',    '081-001-0002', 'male'),
('683380495-4', 'นางสาวสมศรี รักเรียน',    'somsri@kkumail.com',     '081-001-0003', 'female'),
('683380495-5', 'นายอนุชา มานะดี',         'anucha@kkumail.com',     '081-001-0004', 'male'),
('683380495-6', 'นายวิชัย สุขใจ',          'wichai@kkumail.com',     '081-001-0005', 'male'),
('683380495-7', 'นางสาวมาลี งามดี',        'malai@kkumail.com',      '081-001-0006', 'female');

-- ─── Classroom ────────────────────────────────────
INSERT INTO Classroom (room_id, room_name, capacity, floor, room_type) VALUES
('SC5102', 'SC5102',  50, 5, 'บรรยาย'),
('GL149',  'GL149',   80, 1, 'บรรยาย'),
('CP9127', 'CP9127',  40, 1, 'ปฏิบัติ'),
('SC9107', 'SC9107',  60, 9, 'บรรยาย'),
('SC6201', 'SC6201',  50, 2, 'ปฏิบัติ'),
('SC1103', 'ตึกกลม',  60, 1, 'บรรยาย'),
('SC9227', 'SC9227',  40, 2, 'ปฏิบัติ'),
('GL213',  'GL213',   80, 2, 'บรรยาย');

-- ─── Course ───────────────────────────────────────
INSERT INTO Course (course_id, course_code, course_name, credit, semester, academic_year, teacher_id, admin_id) VALUES
('SC602005', 'SC602005', 'ความน่าจะเป็นและสถิติ (PROBABILITY AND STATISTICS)',                               3, 1, 2568, 'TCH001', 'ADM001'),
('LI101001', 'LI101001', 'ภาษาอังกฤษ 1 (ENGLISH I)',                                                         3, 1, 2568, 'TCH002', 'ADM001'),
('CP411106', 'CP411106', 'การเขียนโปรแกรมสำหรับ ML (Programming for Machine Learning)',                      3, 1, 2568, 'TCH001', 'ADM001'),
('SC401201', 'SC401201', 'แคลคูลัสสำหรับวิทยาศาสตร์กายภาพ 1 (CALCULUS FOR PHYSICAL SCIENCE I)',             3, 1, 2568, 'TCH001', 'ADM001'),
('CP411105', 'CP411105', 'ระบบคอมพิวเตอร์ (Computer Systems)',                                               3, 1, 2568, 'TCH001', 'ADM001'),
('CP411701', 'CP411701', 'แรงบันดาลใจของปัญญาประดิษฐ์ (AI Inspiration)',                                     2, 1, 2568, 'TCH002', 'ADM001'),
('GE341511', 'GE341511', 'การคิดเชิงคำนวณและสถิติ (Computational & Statistical Thinking for ABCD)',          3, 1, 2568, 'TCH002', 'ADM001');

-- ─── Schedule ─────────────────────────────────────
INSERT INTO Schedule (course_id, room_id, day_of_week, start_time, end_time, study_hours, semester, academic_year) VALUES
('SC602005', 'SC5102', 'จันทร์',  '10:00:00', '12:00:00', 2.0, 1, 2568),  -- id 1
('SC602005', 'SC5102', 'พุธ',     '10:00:00', '12:00:00', 2.0, 1, 2568),  -- id 2
('LI101001', 'GL149',  'อังคาร',  '09:00:00', '10:00:00', 1.0, 1, 2568),  -- id 3
('LI101001', 'GL149',  'พฤหัสฯ', '09:00:00', '10:00:00', 1.0, 1, 2568),  -- id 4
('CP411106', 'CP9127', 'อังคาร',  '13:00:00', '15:00:00', 2.0, 1, 2568),  -- id 5
('CP411106', 'SC9227', 'พฤหัสฯ', '15:00:00', '17:00:00', 2.0, 1, 2568),  -- id 6
('SC401201', 'SC9107', 'อังคาร',  '16:00:00', '18:00:00', 2.0, 1, 2568),  -- id 7
('SC401201', 'SC9107', 'พฤหัสฯ', '16:00:00', '18:00:00', 2.0, 1, 2568),  -- id 8
('CP411105', 'SC6201', 'พุธ',     '13:00:00', '15:00:00', 2.0, 1, 2568),  -- id 9
('CP411701', 'SC1103', 'พฤหัสฯ', '10:00:00', '12:00:00', 2.0, 1, 2568),  -- id 10
('GE341511', 'GL213',  'ศุกร์',   '13:00:00', '15:00:00', 2.0, 1, 2568);  -- id 11

-- ─── Enrollment ───────────────────────────────────
INSERT INTO Enrollment (student_id, course_id)
SELECT s.student_id, c.course_id
FROM Student s
CROSS JOIN Course c;

-- ─── Attendance ───────────────────────────────────
INSERT INTO Attendance (student_id, schedule_id, attendance_date, check_in_time, status) VALUES
-- ══ saksorn ══
('683380495-2', 1,  '2026-02-02', '10:03:00', 'present'),
('683380495-2', 1,  '2026-02-09', '10:18:00', 'late'),
('683380495-2', 1,  '2026-02-16', '10:05:00', 'present'),
('683380495-2', 1,  '2026-02-23',  NULL,       'absent'),
('683380495-2', 2,  '2026-02-04', '10:08:00', 'present'),
('683380495-2', 2,  '2026-02-11',  NULL,       'absent'),
('683380495-2', 2,  '2026-02-18', '10:05:00', 'present'),
('683380495-2', 2,  '2026-02-25', '10:20:00', 'late'),
('683380495-2', 3,  '2026-02-03', '09:02:00', 'present'),
('683380495-2', 3,  '2026-02-10', '09:22:00', 'late'),
('683380495-2', 3,  '2026-02-17', '09:01:00', 'present'),
('683380495-2', 3,  '2026-02-24', '09:00:00', 'present'),
('683380495-2', 4,  '2026-02-05', '09:03:00', 'present'),
('683380495-2', 4,  '2026-02-12', '09:25:00', 'late'),
('683380495-2', 4,  '2026-02-19',  NULL,       'absent'),
('683380495-2', 4,  '2026-02-26', '09:01:00', 'present'),
('683380495-2', 5,  '2026-02-03', '13:05:00', 'present'),
('683380495-2', 5,  '2026-02-10',  NULL,       'absent'),
('683380495-2', 5,  '2026-02-17', '13:22:00', 'late'),
('683380495-2', 5,  '2026-02-24', '13:04:00', 'present'),
('683380495-2', 6,  '2026-02-05', '15:02:00', 'present'),
('683380495-2', 6,  '2026-02-12', '15:18:00', 'late'),
('683380495-2', 6,  '2026-02-19', '15:01:00', 'present'),
('683380495-2', 6,  '2026-02-26', '15:03:00', 'present'),
('683380495-2', 7,  '2026-02-03', '16:02:00', 'present'),
('683380495-2', 7,  '2026-02-10', '16:20:00', 'late'),
('683380495-2', 7,  '2026-02-17',  NULL,       'absent'),
('683380495-2', 7,  '2026-02-24', '16:00:00', 'present'),
('683380495-2', 8,  '2026-02-05', '16:01:00', 'present'),
('683380495-2', 8,  '2026-02-12', '16:00:00', 'present'),
('683380495-2', 8,  '2026-02-19', '16:18:00', 'late'),
('683380495-2', 8,  '2026-02-26', '16:04:00', 'present'),
('683380495-2', 9,  '2026-02-04', '13:10:00', 'present'),
('683380495-2', 9,  '2026-02-11', '13:30:00', 'late'),
('683380495-2', 9,  '2026-02-18', '13:02:00', 'present'),
('683380495-2', 9,  '2026-02-25', '13:00:00', 'present'),
('683380495-2', 10, '2026-02-05', '10:05:00', 'present'),
('683380495-2', 10, '2026-02-12', '10:02:00', 'present'),
('683380495-2', 10, '2026-02-19', '10:18:00', 'late'),
('683380495-2', 10, '2026-02-26', '10:04:00', 'present'),
('683380495-2', 11, '2026-02-06', '13:05:00', 'present'),
('683380495-2', 11, '2026-02-13',  NULL,       'absent'),
('683380495-2', 11, '2026-02-20', '13:03:00', 'present'),
('683380495-2', 11, '2026-02-27', '13:22:00', 'late'),
-- ══ somchai ══
('683380495-3', 1,  '2026-02-02', '10:05:00', 'present'),
('683380495-3', 1,  '2026-02-09', '10:25:00', 'late'),
('683380495-3', 1,  '2026-02-16',  NULL,       'absent'),
('683380495-3', 1,  '2026-02-23', '10:08:00', 'present'),
('683380495-3', 5,  '2026-02-03', '13:02:00', 'present'),
('683380495-3', 5,  '2026-02-10', '13:25:00', 'late'),
('683380495-3', 5,  '2026-02-17', '13:01:00', 'present'),
('683380495-3', 5,  '2026-02-24',  NULL,       'absent'),
('683380495-3', 9,  '2026-02-04', '13:05:00', 'present'),
('683380495-3', 9,  '2026-02-11', '13:20:00', 'late'),
('683380495-3', 9,  '2026-02-18', '13:01:00', 'present'),
('683380495-3', 9,  '2026-02-25', '13:03:00', 'present'),
('683380495-3', 11, '2026-02-06', '13:10:00', 'present'),
('683380495-3', 11, '2026-02-13', '13:05:00', 'present'),
('683380495-3', 11, '2026-02-20',  NULL,       'absent'),
('683380495-3', 11, '2026-02-27', '13:30:00', 'late'),
-- ══ somsri (มาตรงเวลาเกือบทุกครั้ง) ══
('683380495-4', 1,  '2026-02-02', '10:00:00', 'present'),
('683380495-4', 1,  '2026-02-09', '10:02:00', 'present'),
('683380495-4', 1,  '2026-02-16', '10:01:00', 'present'),
('683380495-4', 1,  '2026-02-23', '10:18:00', 'late'),
('683380495-4', 3,  '2026-02-03', '09:05:00', 'present'),
('683380495-4', 3,  '2026-02-10', '09:22:00', 'late'),
('683380495-4', 3,  '2026-02-17', '09:01:00', 'present'),
('683380495-4', 3,  '2026-02-24', '09:00:00', 'present'),
('683380495-4', 7,  '2026-02-03', '16:00:00', 'present'),
('683380495-4', 7,  '2026-02-10', '16:02:00', 'present'),
('683380495-4', 7,  '2026-02-17', '16:20:00', 'late'),
('683380495-4', 7,  '2026-02-24', '16:01:00', 'present'),
('683380495-4', 10, '2026-02-05', '10:01:00', 'present'),
('683380495-4', 10, '2026-02-12', '10:00:00', 'present'),
('683380495-4', 10, '2026-02-19', '10:00:00', 'present'),
('683380495-4', 10, '2026-02-26', '10:02:00', 'present'),
-- ══ anucha (ขาดและสายบ่อย) ══
('683380495-5', 1,  '2026-02-02',  NULL,       'absent'),
('683380495-5', 1,  '2026-02-09',  NULL,       'absent'),
('683380495-5', 1,  '2026-02-16', '10:35:00', 'late'),
('683380495-5', 1,  '2026-02-23', '10:05:00', 'present'),
('683380495-5', 5,  '2026-02-03',  NULL,       'absent'),
('683380495-5', 5,  '2026-02-10', '13:30:00', 'late'),
('683380495-5', 5,  '2026-02-17',  NULL,       'absent'),
('683380495-5', 5,  '2026-02-24', '13:05:00', 'present'),
('683380495-5', 10, '2026-02-05', '10:01:00', 'present'),
('683380495-5', 10, '2026-02-12',  NULL,       'absent'),
('683380495-5', 10, '2026-02-19', '10:05:00', 'present'),
('683380495-5', 10, '2026-02-26', '10:20:00', 'late'),
('683380495-5', 11, '2026-02-06',  NULL,       'absent'),
('683380495-5', 11, '2026-02-13', '13:40:00', 'late'),
('683380495-5', 11, '2026-02-20', '13:02:00', 'present'),
('683380495-5', 11, '2026-02-27',  NULL,       'absent'),
-- ══ wichai ══
('683380495-6', 2,  '2026-02-04', '10:05:00', 'present'),
('683380495-6', 2,  '2026-02-11', '10:18:00', 'late'),
('683380495-6', 2,  '2026-02-18', '10:02:00', 'present'),
('683380495-6', 2,  '2026-02-25', '10:00:00', 'present'),
('683380495-6', 6,  '2026-02-05', '15:03:00', 'present'),
('683380495-6', 6,  '2026-02-12', '15:20:00', 'late'),
('683380495-6', 6,  '2026-02-19', '15:01:00', 'present'),
('683380495-6', 6,  '2026-02-26',  NULL,       'absent'),
('683380495-6', 7,  '2026-02-03', '16:00:00', 'present'),
('683380495-6', 7,  '2026-02-10', '16:02:00', 'present'),
('683380495-6', 7,  '2026-02-17', '16:20:00', 'late'),
('683380495-6', 7,  '2026-02-24', '16:01:00', 'present'),
('683380495-6', 11, '2026-02-06', '13:04:00', 'present'),
('683380495-6', 11, '2026-02-13', '13:25:00', 'late'),
('683380495-6', 11, '2026-02-20', '13:01:00', 'present'),
('683380495-6', 11, '2026-02-27',  NULL,       'absent'),
-- ══ malai ══
('683380495-7', 3,  '2026-02-03', '09:03:00', 'present'),
('683380495-7', 3,  '2026-02-10', '09:01:00', 'present'),
('683380495-7', 3,  '2026-02-17', '09:18:00', 'late'),
('683380495-7', 3,  '2026-02-24', '09:05:00', 'present'),
('683380495-7', 4,  '2026-02-05', '09:00:00', 'present'),
('683380495-7', 4,  '2026-02-12',  NULL,       'absent'),
('683380495-7', 4,  '2026-02-19', '09:06:00', 'present'),
('683380495-7', 4,  '2026-02-26', '09:22:00', 'late'),
('683380495-7', 8,  '2026-02-05', '16:01:00', 'present'),
('683380495-7', 8,  '2026-02-12', '16:00:00', 'present'),
('683380495-7', 8,  '2026-02-19', '16:18:00', 'late'),
('683380495-7', 8,  '2026-02-26', '16:04:00', 'present'),
('683380495-7', 9,  '2026-02-04', '13:03:00', 'present'),
('683380495-7', 9,  '2026-02-11', '13:01:00', 'present'),
('683380495-7', 9,  '2026-02-18', '13:18:00', 'late'),
('683380495-7', 9,  '2026-02-25', '13:05:00', 'present');

-- ─── AttendanceAnalysis (คำนวณจากข้อมูลข้างบน) ────
INSERT INTO AttendanceAnalysis (student_id, course_id, total_classes, absent_count, late_count, attendance_rate, risk_level) VALUES
('683380495-2', 'SC602005', 8, 2, 2, 75.00, 'Medium'),
('683380495-2', 'LI101001', 8, 1, 2, 87.50, 'Low'),
('683380495-2', 'CP411106', 8, 1, 2, 87.50, 'Low'),
('683380495-2', 'SC401201', 8, 1, 2, 87.50, 'Low'),
('683380495-2', 'CP411105', 4, 0, 1, 100.00,'Low'),
('683380495-2', 'CP411701', 4, 0, 1, 100.00,'Low'),
('683380495-2', 'GE341511', 4, 1, 1, 75.00, 'Medium'),
('683380495-3', 'SC602005', 4, 1, 1, 75.00, 'Medium'),
('683380495-3', 'CP411106', 4, 1, 1, 75.00, 'Medium'),
('683380495-3', 'CP411105', 4, 0, 1, 100.00,'Low'),
('683380495-3', 'GE341511', 4, 1, 1, 75.00, 'Medium'),
('683380495-4', 'SC602005', 4, 0, 1, 100.00,'Low'),
('683380495-4', 'LI101001', 4, 0, 1, 100.00,'Low'),
('683380495-4', 'SC401201', 4, 0, 1, 100.00,'Low'),
('683380495-4', 'CP411701', 4, 0, 0, 100.00,'Low'),
('683380495-5', 'SC602005', 4, 2, 1, 25.00, 'High'),
('683380495-5', 'CP411106', 4, 2, 1, 25.00, 'High'),
('683380495-5', 'CP411701', 4, 1, 1, 75.00, 'Medium'),
('683380495-5', 'GE341511', 4, 2, 1, 25.00, 'High'),
('683380495-6', 'SC602005', 4, 0, 1, 100.00,'Low'),
('683380495-6', 'CP411106', 4, 1, 1, 75.00, 'Medium'),
('683380495-6', 'SC401201', 4, 0, 1, 100.00,'Low'),
('683380495-6', 'GE341511', 4, 1, 1, 75.00, 'Medium'),
('683380495-7', 'LI101001', 8, 1, 2, 87.50, 'Low'),
('683380495-7', 'SC401201', 4, 0, 1, 100.00,'Low'),
('683380495-7', 'CP411105', 4, 0, 1, 100.00,'Low');

-- ─── Grade ────────────────────────────────────────
INSERT INTO Grade (student_id, course_id, attend_score, attitude_score, homework_score, midterm_score, final_score, quiz_score, total_score, grade_letter, semester, academic_year) VALUES
('683380495-2','SC602005',18,9,17,26,34,16,120,'A', 1,2568),
('683380495-2','LI101001',19,9,18,27,35,17,125,'A', 1,2568),
('683380495-2','CP411106',20,10,19,28,37,18,132,'A', 1,2568),
('683380495-2','SC401201',17,8,16,24,32,15,112,'B+',1,2568),
('683380495-2','CP411105',18,9,17,25,33,16,118,'A', 1,2568),
('683380495-2','CP411701',15,7,14,20,28,13, 97,'B', 1,2568),
('683380495-2','GE341511',16,8,15,22,30,14,105,'B+',1,2568),
('683380495-3','SC602005',15,7,14,20,28,12, 96,'B', 1,2568),
('683380495-3','LI101001',14,7,13,18,26,11, 89,'C+',1,2568),
('683380495-3','CP411106',16,8,15,22,30,13, 104,'B+',1,2568),
('683380495-3','SC401201',13,6,12,17,24,10, 82,'C+',1,2568),
('683380495-3','CP411105',15,7,14,20,28,12, 96,'B', 1,2568),
('683380495-3','CP411701',12,6,11,16,22,10, 77,'C+',1,2568),
('683380495-3','GE341511',14,7,13,19,26,11, 90,'B', 1,2568),
('683380495-4','SC602005',20,10,20,29,38,19,136,'A', 1,2568),
('683380495-4','LI101001',19,10,19,28,37,18,131,'A', 1,2568),
('683380495-4','CP411106',20,10,20,30,39,19,138,'A', 1,2568),
('683380495-4','SC401201',18,9,18,27,36,17,125,'A', 1,2568),
('683380495-4','CP411105',19,9,19,28,37,18,130,'A', 1,2568),
('683380495-4','CP411701',17,8,16,24,33,15,113,'B+',1,2568),
('683380495-4','GE341511',18,9,18,26,35,16,122,'A', 1,2568),
('683380495-5','SC602005',10,5,9,14,19,8,  65,'C', 1,2568),
('683380495-5','LI101001',11,5,10,15,20,9, 70,'B', 1,2568),
('683380495-5','CP411106',12,6,11,16,21,9, 75,'B+',1,2568),
('683380495-5','SC401201',9,4,8,12,17,7,   57,'D+',1,2568),
('683380495-5','CP411105',10,5,9,13,18,8,  63,'C', 1,2568),
('683380495-5','CP411701',8,4,7,10,15,7,   51,'D', 1,2568),
('683380495-5','GE341511',10,5,9,13,18,8,  63,'C', 1,2568),
('683380495-6','SC602005',17,8,16,24,32,15,112,'B+',1,2568),
('683380495-6','LI101001',18,9,17,25,33,15,117,'A', 1,2568),
('683380495-6','CP411106',17,8,16,24,32,15,112,'B+',1,2568),
('683380495-6','SC401201',16,8,15,22,30,14,105,'B+',1,2568),
('683380495-6','CP411105',17,8,16,23,31,14,109,'B+',1,2568),
('683380495-6','CP411701',14,7,13,19,26,12, 91,'B', 1,2568),
('683380495-6','GE341511',16,8,15,22,30,13,104,'B+',1,2568),
('683380495-7','SC602005',19,10,18,27,36,17,127,'A', 1,2568),
('683380495-7','LI101001',20,10,19,28,37,18,132,'A', 1,2568),
('683380495-7','CP411106',18,9,17,26,34,16,120,'A', 1,2568),
('683380495-7','SC401201',17,9,16,24,32,15,113,'B+',1,2568),
('683380495-7','CP411105',18,9,17,25,33,16,118,'A', 1,2568),
('683380495-7','CP411701',16,8,15,22,30,14,105,'B+',1,2568),
('683380495-7','GE341511',17,8,16,24,32,15,112,'B+',1,2568);

-- ─── Assignment ───────────────────────────────────
INSERT INTO Assignment (course_id, title, description, due_date, max_score) VALUES
('SC602005','Quiz: Probability Basics',   'แบบทดสอบความน่าจะเป็นเบื้องต้น',          '2026-03-10 23:59:00', 20),
('SC602005','Project: Statistics Report', 'รายงานสถิติจากข้อมูลจริง',                '2026-04-10 23:59:00', 30),
('LI101001','Essay: My Hometown',         'เขียน Essay ภาษาอังกฤษเกี่ยวกับบ้านเกิด', '2026-03-20 23:59:00', 20),
('LI101001','Presentation: Thai Culture', 'นำเสนอวัฒนธรรมไทยเป็นภาษาอังกฤษ',        '2026-04-05 23:59:00', 30),
('CP411106','Lab: Data Preprocessing',    'ทำความสะอาดและเตรียมข้อมูล',              '2026-03-25 23:59:00', 20),
('CP411106','Project: ML Classification', 'สร้างโมเดล Classification ด้วย Python',   '2026-04-20 23:59:00', 40),
('SC401201','Homework: Limits',           'แบบฝึกหัดลิมิตและความต่อเนื่อง',          '2026-03-15 23:59:00', 20),
('SC401201','Homework: Derivatives',      'แบบฝึกหัดการหาอนุพันธ์',                 '2026-04-01 23:59:00', 20),
('CP411105','Lab: CPU Scheduling',        'จำลองการทำงาน CPU Scheduling',            '2026-03-28 23:59:00', 25),
('CP411105','Report: OS Concepts',        'รายงานแนวคิดระบบปฏิบัติการ',              '2026-04-15 23:59:00', 25),
('CP411701','Essay: AI in Daily Life',    'เขียนความเรียงเกี่ยวกับ AI',              '2026-03-18 23:59:00', 25),
('GE341511','Quiz: Statistical Thinking', 'แบบทดสอบการคิดเชิงสถิติ',                '2026-03-22 23:59:00', 20),
('GE341511','Project: Data Analysis',     'วิเคราะห์ข้อมูลชุดหนึ่ง',                 '2026-04-12 23:59:00', 30);

-- ─── Submission ───────────────────────────────────
INSERT INTO Submission (assignment_id, student_id, score, submit_date, graded_date, status) VALUES
(1,'683380495-2',18.0,'2026-03-09 20:00:00','2026-03-11 10:00:00','graded'),
(3,'683380495-2',17.5,'2026-03-19 22:00:00','2026-03-21 09:00:00','graded'),
(5,'683380495-2',19.0,'2026-03-24 21:00:00','2026-03-26 10:00:00','graded'),
(7,'683380495-2',18.5,'2026-03-14 20:00:00','2026-03-16 09:00:00','graded'),
(9,'683380495-2',22.0,'2026-03-27 23:00:00','2026-03-29 10:00:00','graded'),
(11,'683380495-2',23.0,'2026-03-17 21:00:00','2026-03-19 09:00:00','graded'),
(12,'683380495-2',19.0,'2026-03-21 22:00:00','2026-03-23 10:00:00','graded'),
(1,'683380495-3',14.0,'2026-03-10 10:00:00','2026-03-11 11:00:00','graded'),
(5,'683380495-3',15.0,'2026-03-25 09:00:00','2026-03-26 11:00:00','graded'),
(9,'683380495-3',18.0,'2026-03-28 11:00:00','2026-03-29 11:00:00','graded'),
(1,'683380495-4',20.0,'2026-03-08 18:00:00','2026-03-10 09:00:00','graded'),
(3,'683380495-4',19.0,'2026-03-18 17:00:00','2026-03-20 09:00:00','graded'),
(5,'683380495-4',20.0,'2026-03-23 16:00:00','2026-03-25 09:00:00','graded'),
(7,'683380495-4',20.0,'2026-03-14 15:00:00','2026-03-16 09:00:00','graded'),
(1,'683380495-5',10.0,'2026-03-12 23:50:00', NULL,                'late'),
(9,'683380495-5',12.0,'2026-03-30 00:30:00', NULL,                'late'),
(5,'683380495-6',17.0,'2026-03-24 20:00:00','2026-03-26 10:00:00','graded'),
(7,'683380495-6',16.0,'2026-03-14 19:00:00','2026-03-16 10:00:00','graded'),
(12,'683380495-6',18.0,'2026-03-21 20:00:00','2026-03-23 10:00:00','graded'),
(3,'683380495-7',19.5,'2026-03-19 18:00:00','2026-03-21 10:00:00','graded'),
(5,'683380495-7',18.0,'2026-03-24 17:00:00','2026-03-26 10:00:00','graded'),
(11,'683380495-7',24.0,'2026-03-17 16:00:00','2026-03-19 10:00:00','graded');

-- =====================================================
-- ✅ บัญชีทดสอบ
-- =====================================================
-- username: admin    | password: admin1234 | role: admin
-- username: teacher1 | password: teach1234 | role: teacher
-- username: teacher2 | password: teach5678 | role: teacher
-- username: saksorn  | password: 1234      | ID: 683380495-2
-- username: somchai  | password: 1234      | ID: 683380495-3
-- username: somsri   | password: 1234      | ID: 683380495-4
-- username: anucha   | password: 1234      | ID: 683380495-5
-- username: wichai   | password: 1234      | ID: 683380495-6
-- username: malai    | password: 1234      | ID: 683380495-7

-- =====================================================
-- ⚠️  หมายเหตุ: server.js ต้องอัปเดตด้วย
-- =====================================================
-- Column ที่เปลี่ยนชื่อ:
--   User.user_name      → Users.username
--   Student.student_name → Student.name
--   Teacher.teacher_name → Teacher.name
--   Attendance.checkin_time → Attendance.check_in_time
--   Schedule.study_time  → Schedule.start_time + end_time
--   Score table          → Grade table
-- =====================================================
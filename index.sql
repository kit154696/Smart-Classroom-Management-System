-- =====================================================
-- Smart Classroom Management System
-- Database: MySQL 8.0+
-- Engine: InnoDB (รองรับ Foreign Key & Transaction)
-- =====================================================

CREATE DATABASE IF NOT EXISTS smart_classroom
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_classroom;

-- =====================================================
-- 1. USER (ผู้ใช้งานทั้งหมด)
-- =====================================================
CREATE TABLE User (
  user_id     VARCHAR(10)  NOT NULL,
  user_name   VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,         -- ควร hash ด้วย bcrypt
  role        ENUM('admin','teacher','student') NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;

-- =====================================================
-- 2. ADMIN
-- =====================================================
CREATE TABLE Admin (
  admin_id  VARCHAR(10) NOT NULL,
  PRIMARY KEY (admin_id),
  FOREIGN KEY (admin_id) REFERENCES User(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 3. TEACHER (อาจารย์)
-- =====================================================
CREATE TABLE Teacher (
  teacher_id    VARCHAR(10)  NOT NULL,
  teacher_name  VARCHAR(100) NOT NULL,
  PRIMARY KEY (teacher_id),
  FOREIGN KEY (teacher_id) REFERENCES User(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 4. STUDENT (นักศึกษา)
-- =====================================================
CREATE TABLE Student (
  student_id    VARCHAR(10)  NOT NULL,
  student_name  VARCHAR(100) NOT NULL,
  PRIMARY KEY (student_id),
  FOREIGN KEY (student_id) REFERENCES User(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 5. CLASSROOM (ห้องเรียน)
-- =====================================================
CREATE TABLE Classroom (
  room_id    VARCHAR(10)  NOT NULL,
  room_name  VARCHAR(100) NOT NULL,
  capacity   INT          NOT NULL DEFAULT 40,
  PRIMARY KEY (room_id)
) ENGINE=InnoDB;

-- =====================================================
-- 6. COURSE (รายวิชา)
-- =====================================================
CREATE TABLE Course (
  course_id   VARCHAR(10)  NOT NULL,
  course_name VARCHAR(150) NOT NULL,
  teacher_id  VARCHAR(10)  NOT NULL,
  admin_id    VARCHAR(10),
  PRIMARY KEY (course_id),
  FOREIGN KEY (teacher_id) REFERENCES Teacher(teacher_id),
  FOREIGN KEY (admin_id)   REFERENCES Admin(admin_id)
) ENGINE=InnoDB;

-- =====================================================
-- 7. ENROLLMENT (การลงทะเบียน - M:N ระหว่าง Student กับ Course)
-- =====================================================
CREATE TABLE Enrollment (
  enrollment_id  INT          NOT NULL AUTO_INCREMENT,
  student_id     VARCHAR(10)  NOT NULL,
  course_id      VARCHAR(10)  NOT NULL,
  enrolled_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (enrollment_id),
  UNIQUE KEY uq_enroll (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES Student(student_id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES Course(course_id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 8. SCHEDULE (ตารางเรียน)
-- =====================================================
CREATE TABLE Schedule (
  schedule_id  INT         NOT NULL AUTO_INCREMENT,
  course_id    VARCHAR(10) NOT NULL,
  room_id      VARCHAR(10) NOT NULL,
  study_time   VARCHAR(100) NOT NULL,         -- เช่น "จันทร์ 08:00-10:00"
  day_of_week  ENUM('จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์','อาทิตย์') NOT NULL,
  PRIMARY KEY (schedule_id),
  FOREIGN KEY (course_id) REFERENCES Course(course_id)   ON DELETE CASCADE,
  FOREIGN KEY (room_id)   REFERENCES Classroom(room_id)
) ENGINE=InnoDB;

-- =====================================================
-- 9. ATTENDANCE (การเข้าเรียน)
-- =====================================================
CREATE TABLE Attendance (
  attendance_id    INT         NOT NULL AUTO_INCREMENT,
  student_id       VARCHAR(10) NOT NULL,
  schedule_id      INT         NOT NULL,
  attendance_date  DATE        NOT NULL,
  status           ENUM('present','absent','late','excused') NOT NULL DEFAULT 'absent',
  PRIMARY KEY (attendance_id),
  UNIQUE KEY uq_attend (student_id, schedule_id, attendance_date),
  FOREIGN KEY (student_id)  REFERENCES Student(student_id)   ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES Schedule(schedule_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 10. ASSIGNMENT (งานที่มอบหมาย)
-- =====================================================
CREATE TABLE Assignment (
  assignment_id  INT         NOT NULL AUTO_INCREMENT,
  course_id      VARCHAR(10) NOT NULL,
  title          VARCHAR(200) NOT NULL,
  due_date       DATETIME    NOT NULL,
  max_score      DECIMAL(5,2) DEFAULT 100,
  PRIMARY KEY (assignment_id),
  FOREIGN KEY (course_id) REFERENCES Course(course_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 11. SUBMISSION (การส่งงาน)
-- =====================================================
CREATE TABLE Submission (
  submission_id  INT         NOT NULL AUTO_INCREMENT,
  assignment_id  INT         NOT NULL,
  student_id     VARCHAR(10) NOT NULL,
  score          DECIMAL(5,2),
  submit_date    DATETIME    DEFAULT CURRENT_TIMESTAMP,
  status         ENUM('submitted','graded','late') DEFAULT 'submitted',
  PRIMARY KEY (submission_id),
  UNIQUE KEY uq_submit (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES Assignment(assignment_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id)    REFERENCES Student(student_id)       ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 12. SCORE (คะแนนรายวิชา - ลงคะแนน)
-- =====================================================
CREATE TABLE Score (
  score_id        INT         NOT NULL AUTO_INCREMENT,
  student_id      VARCHAR(10) NOT NULL,
  course_id       VARCHAR(10) NOT NULL,
  attend_score    DECIMAL(5,2) DEFAULT 0,    -- เวลาเข้าเรียน  /20
  attitude_score  DECIMAL(5,2) DEFAULT 0,    -- จิตพิสัย        /10
  homework_score  DECIMAL(5,2) DEFAULT 0,    -- ส่งงาน          /20
  midterm_score   DECIMAL(5,2) DEFAULT 0,    -- สอบกลางภาค     /30
  final_score     DECIMAL(5,2) DEFAULT 0,    -- สอบปลายภาค     /40
  quiz_score      DECIMAL(5,2) DEFAULT 0,    -- สอบเก็บคะแนน   /20
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (score_id),
  UNIQUE KEY uq_score (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES Student(student_id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES Course(course_id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- 13. ATTENDANCE_ANALYSIS (วิเคราะห์การเข้าเรียน - VIEW)
-- =====================================================
CREATE VIEW AttendanceAnalysis AS
SELECT
  a.student_id,
  s.student_name,
  sch.course_id,
  c.course_name,
  COUNT(*)                                                       AS total_classes,
  SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)         AS present_count,
  SUM(CASE WHEN a.status = 'absent'  THEN 1 ELSE 0 END)         AS absent_count,
  SUM(CASE WHEN a.status = 'late'    THEN 1 ELSE 0 END)         AS late_count,
  ROUND(
    SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)
    / COUNT(*) * 100, 2
  )                                                              AS attendance_rate,
  CASE
    WHEN ROUND(SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END)/COUNT(*)*100,2) >= 85 THEN 'ปกติ'
    WHEN ROUND(SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END)/COUNT(*)*100,2) >= 80 THEN '⚠️ เฝ้าระวัง'
    ELSE '🔴 เสี่ยง'
  END                                                            AS risk_level
FROM Attendance a
JOIN Student  s   ON a.student_id  = s.student_id
JOIN Schedule sch ON a.schedule_id = sch.schedule_id
JOIN Course   c   ON sch.course_id = c.course_id
GROUP BY a.student_id, sch.course_id;

-- =====================================================
-- 14. GRADE VIEW (คำนวณเกรดอัตโนมัติ)
-- =====================================================
CREATE VIEW GradeView AS
SELECT
  sc.student_id,
  st.student_name,
  sc.course_id,
  c.course_name,
  sc.attend_score,
  sc.attitude_score,
  sc.homework_score,
  sc.midterm_score,
  sc.final_score,
  sc.quiz_score,
  (sc.attend_score + sc.attitude_score + sc.homework_score
   + sc.midterm_score + sc.final_score + sc.quiz_score)          AS total_score,
  CASE
    WHEN (sc.attend_score+sc.attitude_score+sc.homework_score+sc.midterm_score+sc.final_score+sc.quiz_score) >= 80 THEN 'A'
    WHEN (sc.attend_score+sc.attitude_score+sc.homework_score+sc.midterm_score+sc.final_score+sc.quiz_score) >= 75 THEN 'B+'
    WHEN (sc.attend_score+sc.attitude_score+sc.homework_score+sc.midterm_score+sc.final_score+sc.quiz_score) >= 70 THEN 'B'
    WHEN (sc.attend_score+sc.attitude_score+sc.homework_score+sc.midterm_score+sc.final_score+sc.quiz_score) >= 65 THEN 'C+'
    WHEN (sc.attend_score+sc.attitude_score+sc.homework_score+sc.midterm_score+sc.final_score+sc.quiz_score) >= 60 THEN 'C'
    WHEN (sc.attend_score+sc.attitude_score+sc.homework_score+sc.midterm_score+sc.final_score+sc.quiz_score) >= 55 THEN 'D+'
    WHEN (sc.attend_score+sc.attitude_score+sc.homework_score+sc.midterm_score+sc.final_score+sc.quiz_score) >= 50 THEN 'D'
    ELSE 'F'
  END                                                             AS grade
FROM Score sc
JOIN Student st ON sc.student_id = st.student_id
JOIN Course  c  ON sc.course_id  = c.course_id;

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Users
INSERT INTO User VALUES
('USR001','admin',    '$2b$10$hashedAdmin',   'admin',   NOW()),
('USR002','teacher1', '$2b$10$hashedTeach1',  'teacher', NOW()),
('USR003','teacher2', '$2b$10$hashedTeach2',  'teacher', NOW()),
('USR004','student1', '$2b$10$hashedStud1',   'student', NOW()),
('USR005','student2', '$2b$10$hashedStud2',   'student', NOW()),
('USR006','student3', '$2b$10$hashedStud3',   'student', NOW());

INSERT INTO Admin   VALUES ('USR001');
INSERT INTO Teacher VALUES ('USR002','อ.ดร.วิชัย สอนดี'), ('USR003','อ.มาลี รักสอน');
INSERT INTO Student VALUES
('STU001','นายสมชาย ใจดี'),
('STU002','นางสาวสมหญิง รักเรียน'),
('STU003','นายอนุชา มานะเรียน');

INSERT INTO Classroom VALUES
('SC101','SC101',  50),
('SC201','SC201',  60),
('SC301','Lab301', 40),
('SC401','SC401',  80);

INSERT INTO Course VALUES
('CS101','ฐานข้อมูล (Database)',          'USR002','USR001'),
('CS102','การโปรแกรม (Programming)',       'USR002','USR001'),
('CS103','โครงสร้างข้อมูล (Data Structure)','USR003','USR001'),
('CS104','เครือข่ายคอมพิวเตอร์',           'USR003','USR001');

INSERT INTO Enrollment (student_id, course_id) VALUES
('STU001','CS101'),('STU001','CS102'),('STU001','CS103'),
('STU002','CS101'),('STU002','CS104'),
('STU003','CS101'),('STU003','CS102'),('STU003','CS103'),('STU003','CS104');

INSERT INTO Schedule (course_id, room_id, study_time, day_of_week) VALUES
('CS101','SC201','08:00-10:00','จันทร์'),
('CS102','SC301','10:00-12:00','อังคาร'),
('CS103','SC101','13:00-15:00','พุธ'),
('CS104','SC401','09:00-11:00','พฤหัสฯ');

INSERT INTO Attendance (student_id, schedule_id, attendance_date, status) VALUES
('STU001',1,'2025-11-04','present'),
('STU001',1,'2025-11-11','present'),
('STU001',1,'2025-11-18','absent'),
('STU001',2,'2025-11-05','present'),
('STU001',2,'2025-11-12','late'),
('STU002',1,'2025-11-04','present'),
('STU002',1,'2025-11-11','present'),
('STU002',1,'2025-11-18','present');

INSERT INTO Score (student_id, course_id, attend_score, attitude_score, homework_score, midterm_score, final_score, quiz_score) VALUES
('STU001','CS101', 18, 9, 17, 25, 33, 15),
('STU001','CS102', 20,10, 18, 28, 36, 18),
('STU001','CS103', 15, 8, 14, 22, 28, 12),
('STU002','CS101', 20,10, 20, 30, 38, 19),
('STU002','CS104', 17, 9, 15, 24, 31, 14),
('STU003','CS101', 12, 7, 10, 18, 22,  9);

INSERT INTO Assignment (course_id, title, due_date, max_score) VALUES
('CS101','Lab 1: ออกแบบ ER Diagram',      '2025-11-20 23:59:00', 20),
('CS101','Lab 2: สร้างตาราง SQL',           '2025-12-01 23:59:00', 20),
('CS102','Project: โปรแกรม Calculator',     '2025-11-25 23:59:00', 30),
('CS103','Assignment: Linked List',         '2025-12-05 23:59:00', 25);

INSERT INTO Submission (assignment_id, student_id, score, status) VALUES
(1,'STU001',18.5,'graded'),
(1,'STU002',20.0,'graded'),
(2,'STU001',17.0,'graded'),
(3,'STU001',27.5,'graded'),
(4,'STU001',22.0,'graded');

-- =====================================================
-- USEFUL QUERIES
-- =====================================================

-- 1. ดูเกรดนักศึกษา
-- SELECT * FROM GradeView WHERE student_id = 'STU001';

-- 2. ดูอัตราการเข้าเรียน
-- SELECT * FROM AttendanceAnalysis WHERE student_id = 'STU001';

-- 3. นักศึกษาเสี่ยงทุกคน
-- SELECT * FROM AttendanceAnalysis WHERE risk_level != 'ปกติ';

-- 4. ตารางเรียนของนักศึกษา
-- SELECT sc.day_of_week, sc.study_time, c.course_id, c.course_name, t.teacher_name, cr.room_name
-- FROM Enrollment e
-- JOIN Course c    ON e.course_id    = c.course_id
-- JOIN Schedule sc ON c.course_id    = sc.course_id
-- JOIN Teacher t   ON c.teacher_id   = t.teacher_id
-- JOIN Classroom cr ON sc.room_id    = cr.room_id
-- WHERE e.student_id = 'STU001'
-- ORDER BY FIELD(sc.day_of_week,'จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์');

-- 5. ลงคะแนน (INSERT หรือ UPDATE)
-- INSERT INTO Score (student_id, course_id, attend_score, attitude_score, homework_score, midterm_score, final_score, quiz_score)
-- VALUES ('STU001','CS101', 18, 9, 17, 25, 33, 15)
-- ON DUPLICATE KEY UPDATE
--   attend_score=VALUES(attend_score), attitude_score=VALUES(attitude_score),
--   homework_score=VALUES(homework_score), midterm_score=VALUES(midterm_score),
--   final_score=VALUES(final_score), quiz_score=VALUES(quiz_score);
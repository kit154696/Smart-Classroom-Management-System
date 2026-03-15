const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const port = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── MySQL Pool ────────────────────────────────────────────
const pool = mysql.createPool({
  host:                  process.env.MYSQLHOST     || 'localhost',
  user:                  process.env.MYSQLUSER     || 'root',
  password:              process.env.MYSQLPASSWORD || '0812667717asdFGH-',
  database:              process.env.MYSQLDATABASE || 'smart_classroom',
  port:                  process.env.MYSQLPORT     || 3306,
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

// ─── หน้าหลัก ─────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ═══════════════════════════════════════════════════════════
// AUTH APIs  (ใช้ตาราง Users, username, Student.name)
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
    // ตรวจ username ซ้ำ
    const existUser = await query('SELECT user_id FROM User WHERE user_name = ?', [username]);
    if (existUser.length > 0)
      return res.status(409).json({ success: false, message: 'Username นี้มีคนใช้แล้ว' });

    // กำหนด user_id
    let newId;
    if (student_id && student_id.trim() !== '') {
      const existId = await query('SELECT user_id FROM User WHERE user_id = ?', [student_id.trim()]);
      if (existId.length > 0)
        return res.status(409).json({ success: false, message: 'รหัสนิสิต ' + student_id + ' มีในระบบแล้ว' });
      newId = student_id.trim();
    } else {
      const prefix = role === 'teacher' ? 'TCH' : role === 'admin' ? 'ADM' : 'STU';
      const rows   = await query('SELECT COUNT(*) AS cnt FROM User WHERE role = ?', [role]);
      newId = prefix + String(rows[0].cnt + 1).padStart(3, '0');
    }

    // Insert Users
    await query('INSERT INTO User (user_id, user_name, password, role, email) VALUES (?,?,?,?,?)',
      [newId, username, password, role, email]);

    // Insert role-specific
    if (role === 'student')
      await query('INSERT INTO Student (student_id, student_name) VALUES (?,?)', [newId, fullName]);
    if (role === 'teacher')
      await query('INSERT INTO Teacher (teacher_id, teacher_name) VALUES (?,?)', [newId, fullName]);
    if (role === 'admin')
      await query('INSERT INTO Admin (admin_id) VALUES (?)', [newId]);

    res.json({ success: true, message: 'ลงทะเบียนสำเร็จ!', user_id: newId, name: fullName });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const rows = await query(
      'SELECT * FROM User WHERE user_name = ? AND password = ?', [username, password]);
    if (rows.length === 0)
      return res.status(401).json({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' });

    const user = rows[0];
    let name = user.user_name;

    if (user.role === 'student') {
      const s = await query('SELECT student_name FROM Student WHERE student_id = ?', [user.user_id]);
      if (s.length) name = s[0].student_name;
    } else if (user.role === 'teacher') {
      const t = await query('SELECT teacher_name FROM Teacher WHERE teacher_id = ?', [user.user_id]);
      if (t.length) name = t[0].teacher_name;
    } else if (user.role === 'admin') {
      const a = await query('SELECT admin_id FROM Admin WHERE admin_id = ?', [user.user_id]);
      if (a.length && user.user_name) name = user.user_name;
    }

    res.json({ success: true, user_id: user.user_id, username: user.user_name, role: user.role, name });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// GRADE APIs  (ใช้ GradeView ซึ่ง query จาก Grade table)
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
// SCHEDULE APIs  (ใช้ start_time + end_time แทน study_time)
// ═══════════════════════════════════════════════════════════

app.get('/api/schedule/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        sc.day_of_week                                       AS day,
        sc.study_time                                        AS time,
        c.course_id                                          AS code,
        c.course_name                                        AS name,
        t.teacher_name                                    AS teacher,
        cr.room_name                                         AS room
      FROM Enrollment e
      JOIN Course    c  ON e.course_id  = c.course_id
      JOIN Schedule  sc ON c.course_id  = sc.course_id
      JOIN Teacher   t  ON c.teacher_id = t.teacher_id
      JOIN Classroom cr ON sc.room_id   = cr.room_id
      WHERE e.student_id = ?
      ORDER BY FIELD(sc.day_of_week,'จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์','อาทิตย์'),
               sc.study_time
    `, [req.params.student_id]);

    if (!rows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบตารางเรียนของ ' + req.params.student_id });
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// SCORE/GRADE APIs  (ใช้ Grade table แทน Score)
// ═══════════════════════════════════════════════════════════

app.get('/api/score/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT g.*, st.student_name, c.course_name
      FROM Score g
      JOIN Student st ON g.student_id = st.student_id
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
      INSERT INTO Score
        (student_id, course_id, attend_score, attitude_score, homework_score,
         midterm_score, final_score, quiz_score)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        attend_score   = VALUES(attend_score),
        attitude_score = VALUES(attitude_score),
        homework_score = VALUES(homework_score),
        midterm_score  = VALUES(midterm_score),
        final_score    = VALUES(final_score),
        quiz_score     = VALUES(quiz_score),
        
    `, [student_id, course_id,
        attend_score||0, attitude_score||0, homework_score||0,
        midterm_score||0, final_score||0, quiz_score||0]);
    res.json({ success: true, message: 'บันทึกคะแนนสำเร็จ ✓', grade: grade_letter, total });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// ATTENDANCE ANALYSIS  (TABLE ไม่ใช่ VIEW)
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
// STUDENT INFO  (ใช้ Student.name)
// ═══════════════════════════════════════════════════════════

app.get('/api/student/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT s.student_id, s.student_name, u.user_name, u.role
      FROM Student s
      JOIN User u ON s.student_id = u.user_id
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

    // หาวันในสัปดาห์ (ไทย)
    const dayTh = DAY_TH[new Date(date).getDay()];

    // หา schedule ตรงกับวัน
    const schedRows = await query(`
      SELECT sc.schedule_id, sc.course_id, sc.study_time
      FROM Schedule sc
      JOIN Enrollment e ON e.course_id = sc.course_id
      WHERE e.student_id = ? AND sc.day_of_week = ?
      ORDER BY FIELD(sc.day_of_week,'จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์','อาทิตย์'), sc.study_time
      LIMIT 1
    `, [student_id, dayTh]);

    let scheduleId = null, classStart = null, isLate = false, minsLate = 0;

    if (schedRows.length > 0) {
      scheduleId = schedRows[0].schedule_id;
      classStart = schedRows[0].study_time; // TIME object from MySQL
      const startStr = String(classStart).split('-')[0].trim(); // from study_time
      minsLate = minutesLate(checkin_time, startStr.substring(0,5));
      isLate   = minsLate > 15;
    }

    const status = isLate ? 'late' : 'present';

    if (scheduleId) {
      await query(`
        INSERT INTO Attendance (student_id, schedule_id, attendance_date, checkin_time, status)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          checkin_time = VALUES(checkin_time),
          status        = VALUES(status)
      `, [student_id, scheduleId, date, checkin_time, status]);

      // อัปเดต AttendanceAnalysis
      const courseId = schedRows[0].course_id;
      await updateAttendanceAnalysis(student_id, courseId);
    }

    res.json({
      success: true,
      message: isLate ? `มาสาย ${minsLate} นาที` : 'มาทัน',
      data: {
        student_id,
        student_name:     student.student_name,
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
        SUM(CASE WHEN a.status='late'    THEN 1 ELSE 0 END)    AS late_c,
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
// GET /api/attendance/log/:course_id?date=YYYY-MM-DD
// ═══════════════════════════════════════════════════════════

app.get('/api/attendance/log/:course_id', async (req, res) => {
  const { course_id } = req.params;
  const date = req.query.date;
  if (!date) return res.status(400).json({ success: false, message: 'กรุณาส่ง ?date=YYYY-MM-DD' });

  try {
    const dayTh = DAY_TH[new Date(date).getDay()];

    // หา start_time ของ schedule วันนั้น
    const schedInfo = await query(
      'SELECT schedule_id, study_time FROM Schedule WHERE course_id = ? AND day_of_week = ? LIMIT 1',
      [course_id, dayTh]);
    const classStart = schedInfo.length ? String(schedInfo[0].study_time).substring(0, 5) : null;
    const scheduleId = schedInfo.length ? schedInfo[0].schedule_id : null;

    const rows = await query(`
      SELECT
        s.student_id,
        s.student_name,
        a.checkin_time,
        IFNULL(a.status, 'absent')       AS status,
        CASE
          WHEN a.checkin_time IS NOT NULL THEN
            GREATEST(0, ROUND(
              (TIME_TO_SEC(a.checkin_time) - TIME_TO_SEC(?)) / 60
            ))
          ELSE 0
        END AS minutes_late
      FROM Enrollment e
      JOIN Student s ON s.student_id = e.student_id
      LEFT JOIN Attendance a
             ON a.student_id     = s.student_id
            AND a.schedule_id    = ?
            AND a.attendance_date = ?
      WHERE e.course_id = ?
      ORDER BY FIELD(IFNULL(a.status,'absent'),'absent','late','present'), a.checkin_time ASC
    `, [classStart || '00:00:00', scheduleId || 0, date, course_id]);

    res.json({
      success: true, course_id, date, count: rows.length,
      data: rows.map(r => ({
        student_id:       r.student_id,
        student_name:     r.student_name,
        checkin_time:     r.checkin_time || null,
        class_start_time: classStart,
        status:           r.status,
        minutes_late:     Math.round(Number(r.minutes_late) || 0)
      }))
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// MY ATTENDANCE HISTORY (นักศึกษา)
// GET /api/attendance/myhistory/:student_id?course=SC602005
// ═══════════════════════════════════════════════════════════

app.get('/api/attendance/myhistory/:student_id', async (req, res) => {
  const { student_id } = req.params;
  const course_filter  = req.query.course || null;

  try {
    let sql = `
      SELECT
        a.attendance_date,
        a.checkin_time,
        a.status,
        SUBSTRING_INDEX(sc.study_time,'-',1) AS class_start_time,
        sc.day_of_week,
        c.course_id,
        c.course_name,
        CASE
          WHEN a.checkin_time IS NOT NULL AND a.status = 'late' THEN
            GREATEST(0, ROUND(
              (TIME_TO_SEC(a.checkin_time) - TIME_TO_SEC(SUBSTRING_INDEX(sc.study_time,'-',1))) / 60
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
    sql += ' ORDER BY a.attendance_date DESC, a.checkin_time DESC';

    const rows = await query(sql, params);
    res.json({
      success: true, student_id, count: rows.length,
      data: rows.map(r => ({
        attendance_date:  r.attendance_date,
        course_id:        r.course_id,
        course_name:      r.course_name,
        class_start_time: r.class_start_time ? String(r.class_start_time).trim().substring(0,5) : null,
        day_of_week:      r.day_of_week,
        checkin_time:     r.checkin_time ? String(r.checkin_time).substring(0,8) : null,
        status:           r.status,
        minutes_late:     Number(r.minutes_late) || 0
      }))
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── Start Server ─────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 Server รันอยู่ที่ http://localhost:${port}`);
});
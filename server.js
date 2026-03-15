const express  = require('express');
const mysql    = require('mysql2');
const cors     = require('cors');
const path     = require('path');

const app  = express();
const port = 3000;

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

// ─── Helper: แปลงชื่อวันภาษาอังกฤษจาก study_time ──────────
// study_time format: "Monday 09:00-12:00"
function parseDayAndStart(study_time) {
  const parts     = (study_time || '').split(' ');
  const dayEn     = parts[0] || '';
  const timeRange = parts[1] || '';
  const startTime = timeRange.split('-')[0] || '00:00';
  return { dayEn, startTime };
}

// map วันอังกฤษ → วันในสัปดาห์ (getDay index)
const DAY_INDEX = {
  sunday:0, monday:1, tuesday:2, wednesday:3,
  thursday:4, friday:5, saturday:6
};

// ─── หน้าหลัก ─────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ═══════════════════════════════════════════════════════════
// AUTH APIs
// ═══════════════════════════════════════════════════════════

// POST /api/register
app.post('/api/register', async (req, res) => {
  const {
    username, password,
    firstname, lastname,
    student_id, email,
    role = 'student'
  } = req.body;

  // Validate required fields
  if (!username || !password || !firstname || !lastname || !email)
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });

  // Email format validation
  const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailReg.test(email))
    return res.status(400).json({ success: false, message: 'รูปแบบ Email ไม่ถูกต้อง' });

  const fullName = `${firstname.trim()} ${lastname.trim()}`;

  try {
    // Check username duplicate
    const existUser = await query('SELECT user_id FROM User WHERE user_name = ?', [username]);
    if (existUser.length > 0)
      return res.status(409).json({ success: false, message: 'Username นี้มีคนใช้แล้ว' });

    // Determine user_id
    let newId;
    if (student_id && student_id.trim() !== '') {
      // Use provided student_id (validate not duplicate)
      const existId = await query('SELECT user_id FROM User WHERE user_id = ?', [student_id.trim().toUpperCase()]);
      if (existId.length > 0)
        return res.status(409).json({ success: false, message: 'รหัสนิสิต ' + student_id + ' มีในระบบแล้ว' });
      newId = student_id.trim().toUpperCase();
    } else {
      // Auto-generate
      const prefix = role === 'teacher' ? 'TCH' : role === 'admin' ? 'ADM' : 'STU';
      const rows   = await query('SELECT COUNT(*) AS cnt FROM User WHERE role = ?', [role]);
      newId = prefix + String(rows[0].cnt + 1).padStart(3, '0');
    }

    // Try to add email column if not exists (safe, runs once)
    try {
      await query('ALTER TABLE User ADD COLUMN email VARCHAR(200) NULL');
    } catch (_) { /* column already exists — ignore */ }

    // Insert User
    try {
      await query('INSERT INTO User (user_id, user_name, password, role, email) VALUES (?,?,?,?,?)',
        [newId, username, password, role, email]);
    } catch (_) {
      // Fallback without email column if somehow still fails
      await query('INSERT INTO User (user_id, user_name, password, role) VALUES (?,?,?,?)',
        [newId, username, password, role]);
    }

    // Insert role-specific table
    if (role === 'student')
      await query('INSERT INTO Student (student_id, student_name) VALUES (?,?)', [newId, fullName]);
    if (role === 'teacher')
      await query('INSERT INTO Teacher (teacher_id, teacher_name) VALUES (?,?)', [newId, fullName]);
    if (role === 'admin')
      await query('INSERT INTO Admin (admin_id) VALUES (?)', [newId]);

    res.json({
      success: true,
      message: 'ลงทะเบียนสำเร็จ!',
      user_id: newId,
      name: fullName
    });
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
    }
    res.json({ success: true, user_id: user.user_id, username: user.user_name, role: user.role, name });
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
// SCHEDULE APIs
// study_time format: "Monday 09:00-12:00"
// ═══════════════════════════════════════════════════════════

app.get('/api/schedule/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        sc.study_time                    AS time,
        c.course_id                      AS code,
        c.course_name                    AS name,
        t.teacher_name                   AS teacher,
        cr.room_name                     AS room
      FROM Enrollment e
      JOIN Course    c  ON e.course_id  = c.course_id
      JOIN Schedule  sc ON c.course_id  = sc.course_id
      JOIN Teacher   t  ON c.teacher_id = t.teacher_id
      JOIN Classroom cr ON sc.room_id   = cr.room_id
      WHERE e.student_id = ?
    `, [req.params.student_id]);

    if (!rows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบตารางเรียนของ ' + req.params.student_id });

    // แยก day จาก study_time แล้วใส่ field day
    const data = rows.map(r => {
      const { dayEn, startTime } = parseDayAndStart(r.time);
      return { ...r, day: dayEn };
    });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// SCORE APIs
// ═══════════════════════════════════════════════════════════

app.get('/api/score/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT sc.*, st.student_name, c.course_name
      FROM Score sc
      JOIN Student st ON sc.student_id = st.student_id
      JOIN Course  c  ON sc.course_id  = c.course_id
      WHERE sc.student_id = ?
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
  try {
    await query(`
      INSERT INTO Score
        (student_id,course_id,attend_score,attitude_score,homework_score,midterm_score,final_score,quiz_score)
      VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        attend_score=VALUES(attend_score), attitude_score=VALUES(attitude_score),
        homework_score=VALUES(homework_score), midterm_score=VALUES(midterm_score),
        final_score=VALUES(final_score),     quiz_score=VALUES(quiz_score)
    `, [student_id, course_id,
        attend_score||0, attitude_score||0, homework_score||0,
        midterm_score||0, final_score||0,   quiz_score||0]);
    res.json({ success: true, message: 'บันทึกคะแนนสำเร็จ ✓' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// ATTENDANCE ANALYSIS APIs
// AttendanceAnalysis เป็น TABLE (risk_level: Low/Medium/High)
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
// STUDENT INFO API
// ═══════════════════════════════════════════════════════════

app.get('/api/student/:student_id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT s.student_id, s.student_name, u.user_name, u.role FROM Student s JOIN User u ON s.student_id = u.user_id WHERE s.student_id = ?',
      [req.params.student_id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบนักศึกษา' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// NFC CHECK-IN API
// Attendance schema จริง:
//   student_id, course_id, status (Present/Late/Absent), attendance_date, checkin_time
// ═══════════════════════════════════════════════════════════

app.post('/api/attendance/nfc', async (req, res) => {
  const { student_id, date, checkin_time, source } = req.body;
  if (!student_id || !date || !checkin_time)
    return res.status(400).json({ success: false, message: 'กรุณาส่ง student_id, date และ checkin_time' });

  try {
    // ตรวจนักศึกษา
    const stuRows = await query(
      'SELECT student_id, student_name FROM Student WHERE student_id = ?', [student_id]);
    if (!stuRows.length)
      return res.status(404).json({ success: false, message: 'ไม่พบนักศึกษา ' + student_id });
    const student = stuRows[0];

    // หาวันในสัปดาห์จาก date
    const dayOfWeekIndex = new Date(date).getDay(); // 0=Sun ... 6=Sat
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dayEn = dayNames[dayOfWeekIndex];

    // หา schedule ที่ตรงกับวัน (study_time เช่น "Monday 09:00-12:00")
    const schedRows = await query(`
      SELECT sc.schedule_id, sc.course_id, sc.study_time
      FROM Schedule sc
      JOIN Enrollment e ON e.course_id = sc.course_id
      WHERE e.student_id = ?
        AND LOWER(SUBSTRING_INDEX(sc.study_time,' ',1)) = ?
      LIMIT 1
    `, [student_id, dayEn]);

    let courseId    = null;
    let classStart  = null;
    let isLate      = false;
    let minutesLate = 0;

    if (schedRows.length > 0) {
      courseId   = schedRows[0].course_id;
      const { startTime } = parseDayAndStart(schedRows[0].study_time);
      classStart = startTime;

      const [ch, cm] = checkin_time.split(':').map(Number);
      const [sh, sm] = startTime.split(':').map(Number);
      minutesLate = (ch * 60 + cm) - (sh * 60 + sm);
      isLate      = minutesLate > 15;
    }

    // status ใช้ Capitalized ตาม DB จริง
    const status = isLate ? 'Late' : 'Present';

    if (courseId) {
      const scheduleId = schedRows[0].schedule_id;
      await query(`
        INSERT INTO Attendance (student_id, schedule_id, attendance_date, checkin_time, status)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          checkin_time = VALUES(checkin_time),
          status        = VALUES(status)
      `, [student_id, scheduleId, date, checkin_time, status]);
    }

    res.json({
      success: true,
      message: isLate ? `มาสาย ${minutesLate} นาที` : 'มาทัน',
      data: {
        student_id,
        student_name:     student.student_name,
        checkin_time,
        class_start_time: classStart,
        status,
        is_late:          isLate,
        minutes_late:     Math.max(0, minutesLate),
        source:           source || 'nfc',
        date
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// ATTENDANCE LOG (อาจารย์/Admin)
// GET /api/attendance/log/:course_id?date=YYYY-MM-DD
// ═══════════════════════════════════════════════════════════

app.get('/api/attendance/log/:course_id', async (req, res) => {
  const { course_id } = req.params;
  const date = req.query.date;
  if (!date)
    return res.status(400).json({ success: false, message: 'กรุณาส่ง ?date=YYYY-MM-DD' });

  try {
    // หา schedule เพื่อได้ study_time สำหรับแสดงเวลาเริ่มคาบ
    const schedInfo = await query(
      'SELECT study_time FROM Schedule WHERE course_id = ? LIMIT 1', [course_id]);
    const classStartTime = schedInfo.length
      ? parseDayAndStart(schedInfo[0].study_time).startTime
      : null;

    // ดึงนักศึกษาทั้งหมด + สถานะ attendance ของวันนั้น
    const rows = await query(`
      SELECT
        s.student_id,
        s.student_name,
        a.checkin_time,
        a.status           AS att_status,
        CASE
          WHEN a.attendance_id IS NULL THEN 'Absent'
          ELSE a.status
        END                AS status,
        CASE
          WHEN a.checkin_time IS NOT NULL THEN
            GREATEST(0, ROUND(
              (TIME_TO_SEC(a.checkin_time) - TIME_TO_SEC(?)) / 60
            ))
          ELSE 0
        END                AS minutes_late
      FROM Enrollment e
      JOIN Student s ON s.student_id = e.student_id
      LEFT JOIN Schedule sch2 ON sch2.course_id = e.course_id
      LEFT JOIN Attendance a
             ON a.student_id      = s.student_id
            AND a.schedule_id     = sch2.schedule_id
            AND a.attendance_date = ?
      WHERE e.course_id = ?
      ORDER BY
        FIELD(IFNULL(a.status,'Absent'), 'Absent','Late','Present'),
        a.checkin_time ASC
    `, [classStartTime || '00:00:00', date, course_id]);

    res.json({
      success: true, course_id, date, count: rows.length,
      data: rows.map(r => ({
        student_id:       r.student_id,
        student_name:     r.student_name,
        checkin_time:     r.checkin_time || null,
        class_start_time: classStartTime,
        status:           r.status,
        minutes_late:     Math.round(Number(r.minutes_late) || 0)
      }))
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// MY ATTENDANCE HISTORY (นักศึกษา)
// GET /api/attendance/myhistory/:student_id?course=1
// ═══════════════════════════════════════════════════════════

app.get('/api/attendance/myhistory/:student_id', async (req, res) => {
  const { student_id }  = req.params;
  const course_filter   = req.query.course || null;

  try {
    let sql = `
      SELECT
        a.attendance_id,
        a.attendance_date,
        a.checkin_time   AS checkin_time,
        a.status,
        sc.study_time     AS class_start_raw,
        c.course_id,
        c.course_name,
        CASE
          WHEN a.checkin_time IS NOT NULL AND a.status = 'Late' THEN
            GREATEST(0, ROUND(
              (TIME_TO_SEC(a.checkin_time)
               - TIME_TO_SEC(SUBSTRING_INDEX(SUBSTRING_INDEX(sc.study_time,' ',2),' ',-1))) / 60
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
      data: rows.map(r => {
        const { startTime } = parseDayAndStart(r.class_start_raw || '');
        return {
          attendance_date:  r.attendance_date,
          course_id:        r.course_id,
          course_name:      r.course_name,
          class_start_time: startTime || null,
          checkin_time:     r.checkin_time || null,
          status:           r.status,
          minutes_late:     Number(r.minutes_late) || 0
        };
      })
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── Start Server ─────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 Server รันอยู่ที่ http://localhost:${port}`);
});
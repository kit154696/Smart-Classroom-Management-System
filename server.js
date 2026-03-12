const express  = require('express');
const mysql    = require('mysql2');
const cors     = require('cors');
const path     = require('path');

const app  = express();
const port = 3000;

// ─── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve index.html

// ─── 1. เชื่อมต่อ MySQL ──────────────────────────────────
const db = mysql.createConnection({
  host:     'localhost',
  user:     'root',
  password: '0812667717asdFGH-',   // ⚠️ เปลี่ยนเป็นรหัสผ่าน MySQL ของคุณ
  database: 'smart_classroom'      // ⚠️ ชื่อ database ใน TablePlus
});

db.connect((err) => {
  if (err) { console.error('❌ เชื่อมต่อฐานข้อมูลไม่สำเร็จ:', err.message); return; }
  console.log('✅ เชื่อมต่อฐานข้อมูล MySQL สำเร็จแล้ว!');
});

// ─── Helper ───────────────────────────────────────────────
const query = (sql, params = []) =>
  new Promise((res, rej) =>
    db.query(sql, params, (err, rows) => err ? rej(err) : res(rows))
  );

// ─── 2. หน้าหลัก ─────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ═══════════════════════════════════════════════════════════
// AUTH APIs
// ═══════════════════════════════════════════════════════════

// POST /api/register — ลงทะเบียน
app.post('/api/register', async (req, res) => {
  const { username, password, role = 'student' } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });

  try {
    // ตรวจว่า username ซ้ำไหม
    const exist = await query('SELECT user_id FROM User WHERE user_name = ?', [username]);
    if (exist.length > 0)
      return res.status(409).json({ success: false, message: 'Username นี้มีอยู่แล้ว' });

    // สร้าง user_id อัตโนมัติ
    const prefix = role === 'teacher' ? 'TCH' : role === 'admin' ? 'ADM' : 'STU';
    const rows   = await query('SELECT COUNT(*) AS cnt FROM User WHERE role = ?', [role]);
    const newId  = prefix + String(rows[0].cnt + 1).padStart(3, '0');

    await query(
      'INSERT INTO User (user_id, user_name, password, role) VALUES (?, ?, ?, ?)',
      [newId, username, password, role]
    );

    // ถ้าเป็น student ให้เพิ่มในตาราง Student ด้วย
    if (role === 'student')
      await query('INSERT INTO Student (student_id, student_name) VALUES (?, ?)', [newId, username]);
    if (role === 'teacher')
      await query('INSERT INTO Teacher (teacher_id, teacher_name) VALUES (?, ?)', [newId, username]);
    if (role === 'admin')
      await query('INSERT INTO Admin (admin_id) VALUES (?)', [newId]);

    res.json({ success: true, message: 'ลงทะเบียนสำเร็จ!', user_id: newId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/login — เข้าสู่ระบบ
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const rows = await query(
      'SELECT * FROM User WHERE user_name = ? AND password = ?',
      [username, password]
    );
    if (rows.length === 0)
      return res.status(401).json({ success: false, message: 'Username หรือ Password ไม่ถูกต้อง' });

    const user = rows[0];
    let name = user.user_name;

    // ดึงชื่อจริงตาม role
    if (user.role === 'student') {
      const s = await query('SELECT student_name FROM Student WHERE student_id = ?', [user.user_id]);
      if (s.length > 0) name = s[0].student_name;
    } else if (user.role === 'teacher') {
      const t = await query('SELECT teacher_name FROM Teacher WHERE teacher_id = ?', [user.user_id]);
      if (t.length > 0) name = t[0].teacher_name;
    }

    res.json({ success: true, user_id: user.user_id, username: user.user_name, role: user.role, name });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GRADE APIs
// ═══════════════════════════════════════════════════════════

// GET /api/grades/:student_id — ดูเกรดนักศึกษา
app.get('/api/grades/:student_id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM GradeView WHERE student_id = ?', [req.params.student_id]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลของ ' + req.params.student_id });
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SCHEDULE APIs
// ═══════════════════════════════════════════════════════════

// GET /api/schedule/:student_id — ดูตารางเรียน
app.get('/api/schedule/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        sc.day_of_week  AS day,
        sc.study_time   AS time,
        c.course_id     AS code,
        c.course_name   AS name,
        t.teacher_name  AS teacher,
        cr.room_name    AS room
      FROM Enrollment e
      JOIN Course    c  ON e.course_id   = c.course_id
      JOIN Schedule  sc ON c.course_id   = sc.course_id
      JOIN Teacher   t  ON c.teacher_id  = t.teacher_id
      JOIN Classroom cr ON sc.room_id    = cr.room_id
      WHERE e.student_id = ?
      ORDER BY FIELD(sc.day_of_week,'จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์','อาทิตย์')
    `, [req.params.student_id]);

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบตารางเรียนของ ' + req.params.student_id });
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SCORE APIs
// ═══════════════════════════════════════════════════════════

// GET /api/score/:student_id — ดูคะแนนของนักศึกษา
app.get('/api/score/:student_id', async (req, res) => {
  try {
    const rows = await query(`
      SELECT sc.*, st.student_name, c.course_name
      FROM Score sc
      JOIN Student st ON sc.student_id = st.student_id
      JOIN Course  c  ON sc.course_id  = c.course_id
      WHERE sc.student_id = ?
    `, [req.params.student_id]);

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบคะแนนของ ' + req.params.student_id });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/score — บันทึก/อัปเดตคะแนน (INSERT or UPDATE)
app.post('/api/score', async (req, res) => {
  const { student_id, course_id, attend_score, attitude_score,
          homework_score, midterm_score, final_score, quiz_score } = req.body;

  if (!student_id || !course_id)
    return res.status(400).json({ success: false, message: 'กรุณาระบุ student_id และ course_id' });

  try {
    await query(`
      INSERT INTO Score
        (student_id, course_id, attend_score, attitude_score, homework_score, midterm_score, final_score, quiz_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        attend_score   = VALUES(attend_score),
        attitude_score = VALUES(attitude_score),
        homework_score = VALUES(homework_score),
        midterm_score  = VALUES(midterm_score),
        final_score    = VALUES(final_score),
        quiz_score     = VALUES(quiz_score)
    `, [student_id, course_id,
        attend_score || 0, attitude_score || 0, homework_score || 0,
        midterm_score || 0, final_score || 0, quiz_score || 0]);

    res.json({ success: true, message: 'บันทึกคะแนนสำเร็จ ✓' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ATTENDANCE ANALYSIS APIs
// ═══════════════════════════════════════════════════════════

// GET /api/attendance/:student_id — ดูสถิติการเข้าเรียน
app.get('/api/attendance/:student_id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM AttendanceAnalysis WHERE student_id = ?',
      [req.params.student_id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/attendance/risk/all — นักศึกษาที่เสี่ยง
app.get('/api/attendance/risk/all', async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM AttendanceAnalysis WHERE risk_level != 'ปกติ' ORDER BY attendance_rate ASC"
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// STUDENT INFO API
// ═══════════════════════════════════════════════════════════

// GET /api/student/:student_id — ดูข้อมูลนักศึกษา
app.get('/api/student/:student_id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT s.student_id, s.student_name, u.user_name, u.role FROM Student s JOIN User u ON s.student_id = u.user_id WHERE s.student_id = ?',
      [req.params.student_id]
    );
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบนักศึกษา' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Start Server ─────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 Backend Server กำลังรันอยู่ที่ http://localhost:${port}`);
});
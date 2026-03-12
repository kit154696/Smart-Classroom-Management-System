# Smart-Classroom-Management-System
# Smart-Classroom-Management-System
# 🎓 Smart Classroom Management System
ระบบจัดการห้องเรียนอัจฉริยะแบบครบวงจร (ระบบเช็คชื่อ, จัดการคะแนน, ดูตารางเรียน และวิเคราะห์ความเสี่ยงนักศึกษา)

โปรเจกต์นี้แบ่งการทำงานเป็น **Frontend** (HTML/CSS/JS) และ **Backend** (Node.js + Express + MySQL)

---

## 🛠️ เครื่องมือที่ต้องติดตั้งในเครื่อง (Prerequisites)
ก่อนเริ่มรันโปรเจกต์ ตรวจสอบให้แน่ใจว่าเครื่องของคุณมีโปรแกรมเหล่านี้แล้ว:
1. **Node.js**: (แนะนำเวอร์ชัน LTS) - [ดาวน์โหลดที่นี่](https://nodejs.org/)
2. **MySQL / TablePlus**: สำหรับจัดการฐานข้อมูล
3. **VS Code** หรือ Code Editor อื่นๆ

---

## 🚀 วิธีติดตั้งและรันโปรเจกต์ (Setup & Run)

### 1. ติดตั้ง Dependencies (Library ที่จำเป็น)
เปิด Terminal แทร็กไปที่โฟลเดอร์โปรเจกต์นี้ แล้วรันคำสั่ง:
```bash
npm install
2. ตั้งค่าฐานข้อมูล (Database Setup)
เปิดโปรแกรมจัดการ Database (เช่น TablePlus)

นำโค้ดทั้งหมดในไฟล์ index.sql ไปวางแล้วกด Run เพื่อสร้างฐานข้อมูล smart_classroom, ตารางต่างๆ และเพิ่มข้อมูลจำลอง (Mock Data) เบื้องต้น

3. ตั้งค่าการเชื่อมต่อ Database ใน server.js
⚠️ สำคัญมาก: ปัจจุบันไฟล์ server.js ตั้งค่าการเชื่อมต่อ Database ด้วย process.env (เตรียมสำหรับขึ้นโฮสต์จริง)
หากต้องการรันเทสในเครื่องตัวเอง (Localhost) ให้เพื่อนๆ แก้ไขโค้ดใน server.js ช่วงบนๆ เป็นข้อมูลเครื่องตัวเองชั่วคราว เช่น:

JavaScript
const db = mysql.createConnection({
  host:     'localhost',
  user:     'root',
  password: 'รหัสผ่านฐานข้อมูลของคุณ', 
  database: 'smart_classroom',
  port:     3306
});
4. สตาร์ทเซิร์ฟเวอร์ (Start Server)
เปิด Terminal แล้วรันคำสั่ง:

Bash
npm start
(หรือรัน node server.js ก็ได้)
หากสำเร็จ จะมีข้อความขึ้นว่า:
✅ เชื่อมต่อฐานข้อมูล MySQL สำเร็จแล้ว!

5. เปิดใช้งานระบบ (View on Browser)
เข้าเว็บเบราว์เซอร์ไปที่: 👉 http://localhost:3000

📂 โครงสร้างไฟล์ (Project Structure)
index.html : หน้าต่าง UI ของระบบทั้งหมด (เขียนด้วย HTML, CSS และดึง API ด้วย Vanilla JS ในไฟล์เดียว)

server.js  : Backend API (Node.js/Express) จัดการ Routing และคิวรีข้อมูลกับ MySQL

index.sql  : โครงสร้าง Database Schema ข้อมูล Table และ Dummy Data

package.json : รายชื่อ Library ที่ใช้รันโปรเจกต์ (Express, MySQL2, Cors)

🔑 ข้อมูลสำหรับทดสอบเข้าสู่ระบบ (Test Accounts)
สามารถใช้ Account เหล่านี้ทดสอบการ Login ได้ทันที (ข้อมูลอิงจากไฟล์ index.sql):

Teacher (อาจารย์) -> Username: T001 | Password: password123

Student (นักศึกษา) -> Username: STU001 | Password: password123
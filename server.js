const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const mongoURI = 'mongodb+srv://facereco:facereco@faceenroll.rqereoh.mongodb.net/?retryWrites=true&w=majority&appName=FaceEnroll';

const app = express();
const PORT = 5001;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(mongoURI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Schemas & Models
const studentSchema = new mongoose.Schema({
  name: String,
  usn: String,
  age: String,
  course: String,
  phone: String,
  enrolledAt: { type: Date, default: Date.now }
});
const Student = mongoose.model('Student', studentSchema);

const attendanceLogSchema = new mongoose.Schema({
  usn: String,
  name: String,
  course: String,
  recognizedAt: { type: Date, default: Date.now }
});
const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);

const periodwiseAttendanceLogSchema = new mongoose.Schema({
  usn: String,
  name: String,
  course: String,
  period: String,
  recognizedAt: { type: Date, default: Date.now }
});
const PeriodwiseAttendanceLog = mongoose.model('PeriodwiseAttendanceLog', periodwiseAttendanceLogSchema);

const adminSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String
});
const Admin = mongoose.model('Admin', adminSchema);

// Routes

// Student CRUD
app.post('/api/students', async (req, res) => {
  const { name, usn, age, course, phone } = req.body;

  if (!name || !usn || !age || !course || !phone) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const newStudent = new Student({ name, usn, age, course, phone });
    await newStudent.save();
    res.status(200).json({ message: "Student saved to database!" });
  } catch (err) {
    console.error("Error saving student:", err);
    res.status(500).json({ message: "Failed to save student" });
  }
});

app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find().sort({ enrolledAt: -1 });
    res.json(students);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ message: "Failed to fetch students" });
  }
});

// Attendance logs
app.post('/api/attendance', async (req, res) => {
  const { usn, name, course, recognizedAt } = req.body;

  if (!usn) return res.status(400).json({ message: "USN is required" });

  try {
    const student = await Student.findOne({ usn });

    if (!student && (!name || !course)) {
      return res.status(404).json({ message: "Student not found, insufficient manual data provided" });
    }

    const today = new Date().toISOString().split('T')[0];
    const recognizedDate = recognizedAt ? new Date(recognizedAt) : new Date();

    const existingLog = await AttendanceLog.findOne({
      usn,
      recognizedAt: {
        $gte: new Date(today),
        $lt: new Date(new Date(today).setDate(new Date(today).getDate() + 1))
      }
    });

    if (existingLog) return res.status(400).json({ message: "Attendance already recorded for today" });

    const log = new AttendanceLog({
      usn,
      name: student ? student.name : name,
      course: student ? student.course : course,
      recognizedAt: recognizedDate
    });

    await log.save();
    res.status(200).json({ message: "Attendance logged successfully" });
  } catch (err) {
    console.error("Error logging attendance:", err);
    res.status(500).json({ message: "Failed to log attendance" });
  }
});

app.get('/api/attendance', async (req, res) => {
  try {
    const logs = await AttendanceLog.find().sort({ recognizedAt: -1 });
    res.json(logs);
  } catch (err) {
    console.error("Error fetching attendance logs:", err);
    res.status(500).json({ message: "Failed to fetch attendance logs" });
  }
});

// Periodwise attendance
function getPeriodForCurrentTime(currentTime) {
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();

  if (hours === 9) return 'Java';
  if (hours === 10 && minutes >= 10) return 'Python';
  if (hours === 11 && minutes >= 20) return 'Networking';
  if (hours === 12 && minutes >= 30) return 'AI/ML';
  if (hours === 18 && minutes >= 30) return 'React'; // 6:30 PM

  return 'No Period';
}

app.post('/api/periodwise-attendance', async (req, res) => {
  const { usn, recognizedAt } = req.body;

  if (!usn) return res.status(400).json({ message: "USN is required" });

  try {
    const student = await Student.findOne({ usn });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const now = recognizedAt ? new Date(recognizedAt) : new Date();
    const period = getPeriodForCurrentTime(now);

    if (period === 'No Period') return res.status(400).json({ message: "No valid class period at this time" });

    const today = new Date(now.toISOString().split('T')[0]);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const existingLog = await PeriodwiseAttendanceLog.findOne({
      usn,
      period,
      recognizedAt: { $gte: today, $lt: tomorrow }
    });

    if (existingLog) return res.status(400).json({ message: `Attendance already recorded for ${period} today` });

    const log = new PeriodwiseAttendanceLog({
      usn,
      name: student.name,
      course: student.course,
      period,
      recognizedAt: now
    });

    await log.save();
    res.status(200).json({ message: `Period-wise attendance recorded for ${period}`, log });
  } catch (err) {
    console.error("Error logging periodwise attendance:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get('/api/periodwise-attendance', async (req, res) => {
  try {
    const logs = await PeriodwiseAttendanceLog.find().sort({ recognizedAt: -1 });
    res.json(logs);
  } catch (err) {
    console.error("Error fetching periodwise logs:", err);
    res.status(500).json({ message: "Failed to fetch periodwise attendance logs" });
  }
});

// Admin routes
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({ username, email, password: hashedPassword });
    await newAdmin.save();

    res.status(201).json({ message: "Admin created successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    res.status(200).json({ message: "Signin successful", admin: { username: admin.username, email: admin.email } });
  } catch (err) {
    console.error("Signin error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
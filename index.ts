import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

const JWT_SECRET = 'your-super-secure-academic-secret-key';


// =========================================================================
// 0. AUTHENTICATION & LOGIN ENDPOINT (Public)
// =========================================================================

app.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body;

  if (username === 'admin' && password === 'password123') {
    const token = jwt.sign({ username: 'admin', role: 'Administrator' }, JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({
      status: 200,
      message: 'Login successful! Use this token in your Authorization header as "Bearer <token>".',
      token: token
    });
    return;
  }

  res.status(401).json({ status: 401, error: 'Unauthorized: Invalid username or password.' });
});


// =========================================================================
// CUSTOM MIDDLEWARE: JWT Authentication Security Guard
// =========================================================================

const authenticateJWT = (req: Request, res: Response, next: Function): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ status: 401, error: 'Unauthorized: Access token is missing. Please log in via POST /login.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      res.status(401).json({ status: 401, error: 'Unauthorized: Token is invalid or has expired.' });
      return;
    }
    (req as any).user = user;
    next();
  });
};

// Apply security middleware globally to all routes below
app.use(authenticateJWT);


// =========================================================================
// 1. DEPARTMENT ENDPOINTS (Fully Unified CRUD)
// =========================================================================

app.post('/departments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ status: 400, error: 'Bad Request: Department name is required.' });
      return;
    }
    const department = await prisma.department.create({ data: { name } });
    res.status(201).json({ status: 201, message: 'Department successfully created!', data: department });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Department with this name already exists.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to create department.' });
  }
});

app.get('/departments', async (_req: Request, res: Response): Promise<void> => {
  try {
    const departments = await prisma.department.findMany({
      include: { professors: true, courses: true, students: true },
    });
    res.status(200).json({ status: 200, count: departments.length, data: departments });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch departments.' });
  }
});

app.get('/departments/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const department = await prisma.department.findUnique({
      where: { id: Number(id) },
      include: { professors: true, courses: true, students: true },
    });
    if (!department) {
      res.status(404).json({ status: 404, error: `Not Found: Department with ID ${id} does not exist.` });
      return;
    }
    res.status(200).json({ status: 200, data: department });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch department.' });
  }
});

app.put('/departments/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ status: 400, error: 'Bad Request: Department name is required.' });
      return;
    }
    const existing = await prisma.department.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Department with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.department.update({ where: { id: Number(id) }, data: { name } });
    res.status(200).json({ status: 200, message: 'Department fully updated (PUT) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Department name already taken.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to update department.' });
  }
});

app.patch('/departments/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const existing = await prisma.department.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Department with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.department.update({
      where: { id: Number(id) },
      data: { ...(name && { name }) },
    });
    res.status(200).json({ status: 200, message: 'Department partially updated (PATCH) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Department name already taken.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to patch department.' });
  }
});

app.delete('/departments/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.department.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Department with ID ${id} does not exist.` });
      return;
    }
    await prisma.department.delete({ where: { id: Number(id) } });
    res.status(200).json({ status: 200, message: `Department with ID ${id} deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Cannot delete department while related records exist.' });
  }
});


// =========================================================================
// 2. PROFESSOR ENDPOINTS (Fully Unified CRUD)
// =========================================================================

app.post('/professors', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, departmentId } = req.body;
    if (!name || !email || !departmentId) {
      res.status(400).json({ status: 400, error: 'Bad Request: Name, email, and departmentId are required.' });
      return;
    }
    const professor = await prisma.professor.create({
      data: { name, email, departmentId },
      include: { department: true },
    });
    res.status(201).json({ status: 201, message: 'Professor successfully created!', data: professor });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: The specified departmentId does not exist.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Professor email already exists.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to create professor.' });
  }
});

app.get('/professors', async (_req: Request, res: Response): Promise<void> => {
  try {
    const professors = await prisma.professor.findMany({ include: { department: true, courses: true } });
    res.status(200).json({ status: 200, count: professors.length, data: professors });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch professors.' });
  }
});

app.get('/professors/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const professor = await prisma.professor.findUnique({
      where: { id: Number(id) },
      include: { department: true, courses: true },
    });
    if (!professor) {
      res.status(404).json({ status: 404, error: `Not Found: Professor with ID ${id} does not exist.` });
      return;
    }
    res.status(200).json({ status: 200, data: professor });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch professor.' });
  }
});

app.put('/professors/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, departmentId } = req.body;
    if (!name || !email || !departmentId) {
      res.status(400).json({ status: 400, error: 'Bad Request: PUT requires name, email, and departmentId.' });
      return;
    }
    const existing = await prisma.professor.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Professor with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.professor.update({
      where: { id: Number(id) },
      data: { name, email, departmentId },
      include: { department: true },
    });
    res.status(200).json({ status: 200, message: 'Professor fully updated (PUT) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid departmentId provided.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Professor email already in use.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to update professor.' });
  }
});

app.patch('/professors/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, departmentId } = req.body;
    const existing = await prisma.professor.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Professor with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.professor.update({
      where: { id: Number(id) },
      data: { 
        ...(name && { name }), 
        ...(email && { email }), 
        ...(departmentId && { departmentId }) 
      },
      include: { department: true },
    });
    res.status(200).json({ status: 200, message: 'Professor partially updated (PATCH) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid departmentId provided.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Professor email already in use.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to patch professor.' });
  }
});

app.delete('/professors/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.professor.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Professor with ID ${id} does not exist.` });
      return;
    }
    await prisma.professor.delete({ where: { id: Number(id) } });
    res.status(200).json({ status: 200, message: `Professor with ID ${id} deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to delete professor.' });
  }
});


// =========================================================================
// 3. COURSE ENDPOINTS (Fully Unified CRUD)
// =========================================================================

app.post('/courses', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, code, departmentId, professorId } = req.body;
    if (!title || !code || !departmentId || !professorId) {
      res.status(400).json({ status: 400, error: 'Bad Request: Title, code, departmentId, and professorId are required.' });
      return;
    }
    const course = await prisma.course.create({
      data: { title, code, departmentId, professorId },
      include: { department: true, professor: true },
    });
    res.status(201).json({ status: 201, message: 'Course successfully created!', data: course });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid departmentId or professorId provided.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Course code already exists.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to create course.' });
  }
});

app.get('/courses', async (_req: Request, res: Response): Promise<void> => {
  try {
    const courses = await prisma.course.findMany({ include: { department: true, professor: true, enrollments: true } });
    res.status(200).json({ status: 200, count: courses.length, data: courses });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch courses.' });
  }
});

app.get('/courses/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const course = await prisma.course.findUnique({
      where: { id: Number(id) },
      include: { department: true, professor: true, enrollments: { include: { student: true } } },
    });
    if (!course) {
      res.status(404).json({ status: 404, error: `Not Found: Course with ID ${id} does not exist.` });
      return;
    }
    res.status(200).json({ status: 200, data: course });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch course.' });
  }
});

app.put('/courses/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, code, departmentId, professorId } = req.body;
    if (!title || !code || !departmentId || !professorId) {
      res.status(400).json({ status: 400, error: 'Bad Request: PUT requires title, code, departmentId, and professorId.' });
      return;
    }
    const existing = await prisma.course.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Course with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.course.update({
      where: { id: Number(id) },
      data: { title, code, departmentId, professorId },
      include: { department: true, professor: true },
    });
    res.status(200).json({ status: 200, message: 'Course fully updated (PUT) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid departmentId or professorId.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Course code already exists.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to update course.' });
  }
});

app.patch('/courses/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, code, departmentId, professorId } = req.body;
    const existing = await prisma.course.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Course with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.course.update({
      where: { id: Number(id) },
      data: { 
        ...(title && { title }), 
        ...(code && { code }), 
        ...(departmentId && { departmentId }),
        ...(professorId && { professorId })
      },
      include: { department: true, professor: true },
    });
    res.status(200).json({ status: 200, message: 'Course partially updated (PATCH) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid departmentId or professorId.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Course code already exists.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to patch course.' });
  }
});

app.delete('/courses/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.course.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Course with ID ${id} does not exist.` });
      return;
    }
    await prisma.course.delete({ where: { id: Number(id) } });
    res.status(200).json({ status: 200, message: `Course with ID ${id} deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to delete course.' });
  }
});


// =========================================================================
// 4. STUDENT ENDPOINTS (Fully Unified CRUD)
// =========================================================================

app.post('/students', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, departmentId } = req.body;
    if (!name || !email || !departmentId) {
      res.status(400).json({ status: 400, error: 'Bad Request: Name, email, and departmentId are required.' });
      return;
    }
    const student = await prisma.student.create({
      data: { name, email, departmentId },
      include: { department: true },
    });
    res.status(201).json({ status: 201, message: 'Student successfully created!', data: student });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: The specified departmentId does not exist.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Student email already exists.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to create student.' });
  }
});

app.get('/students', async (_req: Request, res: Response): Promise<void> => {
  try {
    const students = await prisma.student.findMany({
      include: {
        department: true,
        enrollments: { include: { course: true } },
      },
    });
    res.status(200).json({ status: 200, count: students.length, data: students });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch students.' });
  }
});

app.get('/students/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const student = await prisma.student.findUnique({
      where: { id: Number(id) },
      include: { department: true, enrollments: { include: { course: true } } },
    });
    if (!student) {
      res.status(404).json({ status: 404, error: `Not Found: Student with ID ${id} does not exist.` });
      return;
    }
    res.status(200).json({ status: 200, data: student });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch student.' });
  }
});

app.put('/students/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, departmentId } = req.body;
    if (!name || !email || !departmentId) {
      res.status(400).json({ status: 400, error: 'Bad Request: PUT requires name, email, and departmentId.' });
      return;
    }
    const existing = await prisma.student.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Student with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.student.update({
      where: { id: Number(id) },
      data: { name, email, departmentId },
      include: { department: true },
    });
    res.status(200).json({ status: 200, message: 'Student fully updated (PUT) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid departmentId provided.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Student email already in use.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to update student.' });
  }
});

app.patch('/students/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, departmentId } = req.body;
    const existing = await prisma.student.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Student with ID ${id} does not exist.` });
      return;
    }
    const updated = await prisma.student.update({
      where: { id: Number(id) },
      data: { 
        ...(name && { name }), 
        ...(email && { email }), 
        ...(departmentId && { departmentId }) 
      },
      include: { department: true },
    });
    res.status(200).json({ status: 200, message: 'Student partially updated (PATCH) successfully!', data: updated });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid departmentId provided.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: Student email already in use.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to patch student.' });
  }
});

app.delete('/students/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.student.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Student with ID ${id} does not exist.` });
      return;
    }
    await prisma.student.delete({ where: { id: Number(id) } });
    res.status(200).json({ status: 200, message: `Student with ID ${id} deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to delete student.' });
  }
});


// =========================================================================
// 5. ENROLLMENT ENDPOINTS (Junction Table)
// =========================================================================

app.post('/enrollments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { studentId, courseId } = req.body;
    if (!studentId || !courseId) {
      res.status(400).json({ status: 400, error: 'Bad Request: studentId and courseId are required.' });
      return;
    }
    const enrollment = await prisma.enrollment.create({
      data: { studentId, courseId },
      include: { student: true, course: true },
    });
    res.status(201).json({ status: 201, message: 'Student successfully enrolled in course!', data: enrollment });
  } catch (error: any) {
    if (error.code === 'P2003') {
      res.status(400).json({ status: 400, error: 'Foreign Key Violation: Invalid studentId or courseId provided.' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, error: 'Conflict: This student is already enrolled in this course.' });
      return;
    }
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to process enrollment.' });
  }
});

app.get('/enrollments', async (_req: Request, res: Response): Promise<void> => {
  try {
    const enrollments = await prisma.enrollment.findMany({ include: { student: true, course: true } });
    res.status(200).json({ status: 200, count: enrollments.length, data: enrollments });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch enrollments.' });
  }
});

app.get('/enrollments/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: Number(id) },
      include: { student: true, course: true },
    });
    if (!enrollment) {
      res.status(404).json({ status: 404, error: `Not Found: Enrollment with ID ${id} does not exist.` });
      return;
    }
    res.status(200).json({ status: 200, data: enrollment });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to fetch enrollment.' });
  }
});

app.delete('/enrollments/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.enrollment.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ status: 404, error: `Not Found: Enrollment record with ID ${id} does not exist.` });
      return;
    }
    await prisma.enrollment.delete({ where: { id: Number(id) } });
    res.status(200).json({ status: 200, message: `Enrollment ID ${id} removed successfully.` });
  } catch (error: any) {
    res.status(500).json({ status: 500, error: 'Internal Server Error: Failed to delete enrollment.' });
  }
});


// =========================================================================
// SERVER START
// =========================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
import express from 'express';
import { createStudentRequest, updateStudentRequest } from '../controllers/appsheet.js';

const router = express.Router();
router.post('/', createStudentRequest);
router.put('/', updateStudentRequest);

export default router;

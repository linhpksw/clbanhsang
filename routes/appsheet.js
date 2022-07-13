import express from 'express';
import { appsheetRequest, updateStudentRequest } from '../controllers/appsheet.js';

const router = express.Router();
router.post('/', appsheetRequest);
router.put('/:studentId', updateStudentRequest);

export default router;

import express from 'express';
import {
    createStudentRequest,
    deleteStudentRequest,
    updateStudentRequest,
} from '../controllers/appsheet.js';

const router = express.Router();
router.post('/create', createStudentRequest);
router.put('/update', updateStudentRequest);
router.put('/delete', deleteStudentRequest);

export default router;

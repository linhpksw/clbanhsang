import express from 'express';
import * as AppSheet from '../controllers/appsheet.js';

const router = express.Router();
router.post('/create', AppSheet.createStudentRequest);
router.put('/update', AppSheet.updateStudentRequest);
router.put('/delete', AppSheet.deleteStudentRequest);

router.put('/updateClass', AppSheet.updateClassRequest);

export default router;

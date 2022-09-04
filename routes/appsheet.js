import express from 'express';
import * as AppSheet from '../controllers/appsheet.js';

const router = express.Router();
router.post('/create', AppSheet.createStudentRequest);
router.put('/update', AppSheet.updateStudentRequest);
router.put('/delete', AppSheet.deleteStudentRequest);

router.post('/cash', AppSheet.cashRequest);

router.put('/updateClass', AppSheet.updateClassRequest);

export default router;

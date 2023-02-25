import express from 'express';
import {
    getListUserFromAdmin,
    getNotRegisterFromAdmin,
    getSeekInfoFromAdmin,
    getListUserFromClassId,
    getNotRegisterFromClassId,
    getNotPaymentUserFromClassId,
    createMockMessageFromClassId,
    getIncludeUser,
    sendBulk,
    alarmStudentNotPayment2Parent,
} from '../controllers/gs.js';

const router = express.Router();
// Admin
router.post('/getListUserFromAdmin', getListUserFromAdmin);
router.post('/getNotRegisterFromAdmin', getNotRegisterFromAdmin);
router.post('/getSeekInfoFromAdmin', getSeekInfoFromAdmin);

// Assistants
router.post('/getListUserFromClassId', getListUserFromClassId);
router.post('/getNotRegisterFromClassId', getNotRegisterFromClassId);
router.post('/getNotPaymentUserFromClassId', getNotPaymentUserFromClassId);
router.post('/createMockMessageFromClassId', createMockMessageFromClassId);

router.post('/alarmStudentNotPayment2Parent', alarmStudentNotPayment2Parent);

// Share
router.post('/getIncludeUser', getIncludeUser);
router.post('/sendBulk', sendBulk);

export default router;

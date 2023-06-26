import express from 'express';
import {
    getListUserFromClassId,
    getNotRegisterFromClassId,
    getNotPaymentUserFromClassId,
    createMockMessageFromClassId,
    getIncludeUser,
    sendBulk,
    alarmStudentNotPayment2Parent,
    getZaloUsers,
    getStatistic,
} from '../controllers/gs.js';

const router = express.Router();
// OA Managaer
router.post('/getZaloUsers', getZaloUsers);
router.post('/getStatistic', getStatistic);

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

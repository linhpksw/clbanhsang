import express from 'express';
import * as Sheets from '../controllers/gs.js';

const router = express.Router();
// OA Managaer
router.post('/checkOARegister', Sheets.checkOARegister);
router.post('/getOAUsers', Sheets.getOAUsers);
router.post('/getStatistic', Sheets.getStatistic);
router.post('/sendMessageDemo', Sheets.sendMessageDemo);
router.post('/getNotPayUsers', Sheets.getNotPayUsers);

// Assistants
router.post('/getListUserFromClassId', Sheets.getListUserFromClassId);
router.post('/getNotRegisterFromClassId', Sheets.getNotRegisterFromClassId);

router.post('/alarmStudentNotPayment2Parent', Sheets.alarmStudentNotPayment2Parent);

// Share
router.post('/getIncludeUser', Sheets.getIncludeUser);
router.post('/sendBulk', Sheets.sendBulk);

export default router;

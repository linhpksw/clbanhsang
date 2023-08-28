import express from 'express';
import * as Sheets from '../controllers/gs.js';

const router = express.Router();

// OA Managaer
router.post('/checkOARegister', Sheets.checkOARegister);
router.post('/getOAUsers', Sheets.getOAUsers);

router.post('/getNotPayUsers', Sheets.getNotPayUsers);
router.post('/alarmNotPayUsers', Sheets.alarmNotPayUsers);

router.post('/sendMessage', Sheets.sendMessage);

router.post('/getStatistic', Sheets.getStatistic);

// Database
router.post('/syncStudentList', Sheets.syncStudentList);

// Score Database
router.post('/syncScoreList', Sheets.syncScoreList);
router.post('/syncScore', Sheets.getScore);
router.post('/syncScore', Sheets.syncScore);

export default router;

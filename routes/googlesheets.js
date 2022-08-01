import express from 'express';
import { getListUser, sendListUser, getIncludeUser, searchNotRegister } from '../controllers/googlesheets.js';

const router = express.Router();
router.post('/search', getListUser);
router.post('/searchInclude', getIncludeUser);
router.post('/searchNotRegister', searchNotRegister);
router.post('/send', sendListUser);

export default router;

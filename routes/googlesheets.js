import express from 'express';
import { getListUser, sendListUser, getIncludeUser, getExcludeUser } from '../controllers/googlesheets.js';

const router = express.Router();
router.post('/search', getListUser);
router.post('/searchInclude', getIncludeUser);
router.post('/searchExclude', getExcludeUser);
router.post('/send', sendListUser);

export default router;

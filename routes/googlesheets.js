import express from 'express';
import { getListUser, sendListUser } from '../controllers/googlesheets.js';

const router = express.Router();
router.post('/search', getListUser);
router.post('/send', sendListUser);

export default router;

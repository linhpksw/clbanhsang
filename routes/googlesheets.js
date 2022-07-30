import express from 'express';
import { getListUser } from '../controllers/googlesheets.js';

const router = express.Router();
router.post('/', getListUser);

export default router;

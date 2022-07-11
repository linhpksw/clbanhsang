import express from 'express';
import { appsheetRequest } from '../controllers/appsheet.js';

const router = express.Router();
router.post('/', appsheetRequest);

export default router;

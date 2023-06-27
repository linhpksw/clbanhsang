import express from 'express';
import * as Users from '../controllers/user.js';

const router = express.Router();
router.post('/token', Users.tokenRequest);
router.post('/', Users.userRequest);
router.post('/gs', Users.updateRequest);
router.post('/invoice', Users.invoiceRequest);

export default router;

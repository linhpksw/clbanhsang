import express from 'express';
import {
    getListUserFromAdmin,
    getNotRegisterFromAdmin,
    getSeekInfoFromAdmin,
    getListUserFromClassId,
    getNotRegisterFromClassId,
    createMockMessageFromClassId,
    getIncludeUser,
    sendBulk,
} from '../controllers/gs.js';

const router = express.Router();
// Admin
router.post('/getListUserFromAdmin', getListUserFromAdmin);
router.post('/getNotRegisterFromAdmin', getNotRegisterFromAdmin);
router.post('/getSeekInfoFromAdmin', getSeekInfoFromAdmin);

// Assistants
router.post('/getListUserFromClassId', getListUserFromClassId);
router.post('/getNotRegisterFromClassId', getNotRegisterFromClassId);
router.post('/createMockMessageFromClassId', createMockMessageFromClassId);

// Share
router.post('/getIncludeUser', getIncludeUser);
router.post('/sendBulk', sendBulk);

export default router;

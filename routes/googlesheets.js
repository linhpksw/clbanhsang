import express from 'express';
import {
    getListUser,
    sendListUser,
    getIncludeUser,
    searchNotRegister,
    searchNotRegisterStudent,
    getListUserFromClassId,
} from '../controllers/googlesheets.js';

const router = express.Router();
router.post('/search', getListUser);
router.post('/searchClassId', getListUserFromClassId);
router.post('/searchInclude', getIncludeUser);
router.post('/searchNotRegister', searchNotRegister);
router.post('/searchNotRegisterStudent', searchNotRegisterStudent);
router.post('/send', sendListUser);

export default router;

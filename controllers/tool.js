import { findOneUser, updateOneUser } from './mongo.js';
import * as ZaloAPI from './zalo.js';
import { updateTokenInDB } from './mongo.js';

function nomarlizeSyntax(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, '');
}

async function sendResponse2Client(res, accessToken, refreshToken, zaloUserId, tokenColl, messageId, responseContent, action) {
    await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, action);

    await ZaloAPI.sendMessage(accessToken, zaloUserId, responseContent);

    await res.send('Done!');

    await updateTokenInDB(tokenColl, refreshToken);
}

async function deleteAccount() {}

async function signUp(res, accessToken, refreshToken, zaloUserId, zaloColl, classColl, tokenColl, formatSyntax, messageId, zaloRole) {
    if (formatSyntax.length !== 21) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. ${zaloRole} hãy nhập lại.`;
        sendResponse2Client(res, accessToken, refreshToken, zaloUserId, tokenColl, messageId, failContent, 'sad');
        return;
    }
    // kiem tra tren zalo collection
    const { role, displayName } = await findOneUser(zaloColl, { zaloUserId: `${zaloUserId}` }, { projection: { _id: 0, role: 1, displayName: 1 } });

    if (role !== null) {
        const failContent = `Tài khoản đã có trên hệ thống. ${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

        sendResponse2Client(res, accessToken, refreshToken, zaloUserId, tokenColl, messageId, failContent, 'like');

        return;
    }

    // kiem tra tren classes collection
    const studentId = parseInt(formatSyntax.substring(4, 11));
    const registerPhone = formatSyntax.slice(-10);

    const userInfo = await findOneUser(
        classColl,
        { studentID: studentId },
        {
            projection: {
                _id: 0,
                fullName: 1,
                classID: 1,
                leaveDate: 1,
                studentPhone: 1,
                firstParentPhone: 1,
                secondParentPhone: 1,
            },
        }
    );

    if (userInfo === null) {
        const failContent = `❌ Đăng kí thất bại!\n\nMã học sinh ${studentId} không có trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(res, accessToken, refreshToken, zaloUserId, tokenColl, messageId, failContent, 'sad');

        return;
    }

    let { firstParentPhone, secondParentPhone, studentPhone, fullName, classID, leaveDate } = userInfo;

    let registerPhoneList;
    if (zaloRole === 'Phụ huynh') {
        registerPhoneList = [firstParentPhone, secondParentPhone];
    } else {
        registerPhoneList = [studentPhone];
    }

    if (!registerPhoneList.includes(registerPhone)) {
        const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(res, accessToken, refreshToken, zaloUserId, tokenColl, messageId, failContent, 'sad');

        return;
    }
    // set up role cho zalo user

    const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được liên kết với học sinh: ${fullName}.\nMã IDHS: ${studentId}\n\nTừ bây giờ, ${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

    sendResponse2Client(res, accessToken, refreshToken, zaloUserId, tokenColl, messageId, successContent, 'heart');

    let status;
    leaveDate === null ? (status = 'Đang học') : (status = 'Nghỉ học');

    const newDoc = {
        aliasName: `PH ${fullName}`,
        userPhone: `${registerPhone}`,
        role: zaloRole,
        status: status,
        classId: classID.slice(-7),
        studentId: studentId,
    };

    const filter = { zaloUserId: `${zaloUserId}` };
    const updateDoc = {
        $set: newDoc,
    };
    await updateOneUser(zaloColl, filter, updateDoc);

    await ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
    await ZaloAPI.tagFollower(accessToken, zaloUserId, classID);
    await ZaloAPI.tagFollower(accessToken, zaloUserId, status);

    return;
}

async function forceFollowOA(accessToken, zaloUserId) {
    const notFollowContent = 'PHHS vui lòng nhấn quan tâm OA để sử dụng đầy đủ những tính năng của lớp toán.';
    await ZaloAPI.sendMessage(accessToken, zaloUserId, notFollowContent);
}

export { nomarlizeSyntax, forceFollowOA, signUp };

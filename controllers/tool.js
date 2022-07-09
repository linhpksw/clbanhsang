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

async function sendResponse2Client(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    tokenColl,
    messageId,
    responseContent,
    action
) {
    await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, action);

    await ZaloAPI.sendMessage(accessToken, zaloUserId, responseContent);

    await res.send('Done!');

    await updateTokenInDB(tokenColl, refreshToken);
}

async function deleteAccount() {}

async function signUp(
    res,
    accessToken,
    refreshToken,
    zaloUserId,
    zaloColl,
    classColl,
    tokenColl,
    formatSyntax,
    messageId,
    zaloRole
) {
    if (formatSyntax.length !== 21) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. ${zaloRole} hãy nhập lại.`;
        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'sad'
        );
        return;
    }

    const targetStudentId = parseInt(formatSyntax.substring(4, 11));
    const registerPhone = formatSyntax.slice(-10);

    // kiem tra tren zalo collection
    let { displayName, zaloStudentId, aliasName, zaloClassId } = await findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, displayName: 1, zaloStudentId: 1, aliasName: 1, zaloClassId: 1 } }
    );

    if (zaloStudentId.includes(targetStudentId)) {
        const notifyContent = `⭐ Tài khoản đã có trên hệ thống!\n\n${zaloRole} có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            notifyContent,
            'like'
        );

        return;
    }

    // kiem tra tren classes collection

    const classUserInfo = await findOneUser(
        classColl,
        { studentID: targetStudentId },
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

    if (classUserInfo === null) {
        const failContent = `❌ Đăng kí thất bại!\n\nMã học sinh ${targetStudentId} không có trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'sad'
        );

        return;
    }

    let { firstParentPhone, secondParentPhone, studentPhone, fullName, classID, leaveDate } =
        classUserInfo;

    let registerPhoneList;

    if (zaloRole === 'Phụ huynh') {
        registerPhoneList = [firstParentPhone, secondParentPhone];
    } else {
        registerPhoneList = [studentPhone];
    }

    if (!registerPhoneList.includes(registerPhone)) {
        const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(
            res,
            accessToken,
            refreshToken,
            zaloUserId,
            tokenColl,
            messageId,
            failContent,
            'sad'
        );

        return;
    }
    // set up role cho zalo user

    const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được liên kết với học sinh ${fullName}.\n\nMã IDHS: ${targetStudentId}\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

    sendResponse2Client(
        res,
        accessToken,
        refreshToken,
        zaloUserId,
        tokenColl,
        messageId,
        successContent,
        'heart'
    );

    let status;
    leaveDate === null ? (status = 'Đang học') : (status = 'Nghỉ học');

    const zaloRole2Short = {
        'Phụ huynh': 'PH',
        'Học sinh': 'HS',
    };

    const newDoc = {
        aliasName: aliasName.push(`${zaloRole2Short[zaloRole]} ${fullName}`),
        userPhone: `${registerPhone}`,
        role: zaloRole,
        status: status,
        zaloClassId: zaloClassId.push(classID.slice(-7)),
        zaloStudentId: zaloStudentId.push(targetStudentId),
    };

    const filter = { zaloUserId: `${zaloUserId}` };
    const updateDoc = {
        $set: newDoc,
    };
    await updateOneUser(zaloColl, filter, updateDoc);

    const tagNameArray = [zaloRole, ...zaloClassId, status];
    await ZaloAPI.tagFollower(accessToken, zaloUserId, tagNameArray);

    return;
}

async function forceFollowOA(accessToken, zaloUserId) {
    const notFollowContent =
        'PHHS vui lòng nhấn quan tâm OA để sử dụng đầy đủ những tính năng của lớp toán.';
    await ZaloAPI.sendMessage(accessToken, zaloUserId, notFollowContent);
}

export { nomarlizeSyntax, forceFollowOA, signUp };

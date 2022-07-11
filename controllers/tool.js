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
    ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, action);

    await ZaloAPI.sendMessage(accessToken, zaloUserId, responseContent);

    res.send('Done!');

    updateTokenInDB(tokenColl, refreshToken);
}

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
    const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được liên kết với học sinh ${fullName}.\n\nMã ID HS: ${targetStudentId}\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

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

    const zaloRole2Short = {
        'Phụ huynh': 'PH',
        'Học sinh': 'HS',
    };
    // them class id moi
    classID.includes('#') ? zaloClassId.push(`N${classID.slice(-6)}`) : zaloClassId.push(classID);

    // them id hs moi
    zaloStudentId.push(targetStudentId);
    // them alias moi
    aliasName.push(`${zaloRole2Short[zaloRole]} ${fullName}`);

    // Cap nhat tag tren Zalo OA Chat
    ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
    ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassId.at(-1));

    // cap nhat role cho PHHS trong zaloUsers Collection
    const newDoc = {
        aliasName: aliasName,
        userPhone: `${registerPhone}`,
        role: zaloRole,
        zaloClassId: zaloClassId,
        zaloStudentId: zaloStudentId,
    };

    const filter = { zaloUserId: `${zaloUserId}` };
    const updateDoc = {
        $set: newDoc,
    };

    updateOneUser(zaloColl, filter, updateDoc);

    // Cap nhat thong tin tren Zalo OA Chat
    let formatZaloStudentId;
    let formatAliasName;

    zaloStudentId.length === 1
        ? (formatZaloStudentId = zaloStudentId[0])
        : (formatZaloStudentId = zaloStudentId.join(', '));

    aliasName.length === 1
        ? (formatAliasName = aliasName[0])
        : (formatAliasName = aliasName.join(', '));

    ZaloAPI.updateFollowerInfo(
        accessToken,
        formatZaloStudentId,
        zaloUserId,
        registerPhone,
        formatAliasName
    );

    return;
}

async function forceFollowOA(accessToken, zaloUserId) {
    const notFollowContent =
        'PHHS vui lòng nhấn quan tâm OA để sử dụng đầy đủ những tính năng của lớp toán.';
    await ZaloAPI.sendMessage(accessToken, zaloUserId, notFollowContent);
}

export { nomarlizeSyntax, forceFollowOA, signUp };

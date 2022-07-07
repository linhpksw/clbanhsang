import fetch from 'node-fetch';

async function getFollowers(accessToken) {
    let totalFollowers = [];
    let offset = 0;
    let count = 50;
    const dataRequest = `%7B%22offset%22%3A${offset}%2C%22count%22%3A${count}%7D`;

    const URL = `https://openapi.zalo.me/v2.0/oa/getfollowers?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = await response.json();

    const { total, followers } = jsonResponse.data;
    totalFollowers.push(...followers);

    while (totalFollowers.length < total) {
        offset += 50;
        count += 50;
        const dataRequest = `%7B%22offset%22%3A${offset}%2C%22count%22%3A${count}%7D`;

        const URL = `https://openapi.zalo.me/v2.0/oa/getfollowers?data=${dataRequest}`;

        const response = await fetch(URL, {
            method: 'get',
            headers: { access_token: accessToken },
        });

        const jsonResponse = await response.json();

        const { total, followers } = jsonResponse.data;

        totalFollowers.push(...followers);
    }

    let result = [];

    for (let i = 0; i < totalFollowers.length; i++) {
        const zaloUserId = totalFollowers[i].user_id;

        const userData = await getProfile(zaloUserId, accessToken);

        result.push(userData);
    }

    return result;
}

async function getProfile(zaloUserId, accessToken) {
    const dataRequest = `%7B%22user_id%22%3A%22${zaloUserId}%22%7D`;

    const URL = `https://openapi.zalo.me/v2.0/oa/getprofile?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = (await response.json()).data;

    let {
        user_gender: userGender,
        display_name: displayName,
        shared_info: shareInfo = {},
        tags_and_notes_info: tagsAndNotesInfo,
    } = jsonResponse;

    userGender === 1 ? (userGender = 'Nam') : (userGender = 'Nữ');

    const {
        address: studentId = null,
        phone: userPhone = null,
        name: aliasName = null,
    } = shareInfo;

    const { tag_names: tagsName } = tagsAndNotesInfo;

    const classId = tagsName.filter((s) => s.includes('A')) || null;

    const role = tagsName.filter((s) => s.includes('P')) || null;

    const status =
        tagsName.filter((s) => !s.includes(classId) && !s.includes(role)) ||
        null;

    const result = {
        zaloUserId: zaloUserId,
        displayName: displayName,
        aliasName: aliasName,
        userGender: userGender,
        userPhone: userPhone,
        role: role[0],
        status: status[0],
        classId: classId[0],
        studentId: studentId,
    };
    return result;
}

async function sendMessage(accessToken, userId, message) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v2.0/oa/message?`;

    const content = {
        recipient: { user_id: `${userId}` },
        message: { text: `${message}` },
    };

    await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });
}

export { getFollowers, getProfile, sendMessage };

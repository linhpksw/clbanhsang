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

    // console.log(jsonResponse);
    // return;

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

        const userData = await getProfile(accessToken, zaloUserId);

        result.push(userData);
    }

    return result;
}

async function getProfile(accessToken, zaloUserId) {
    const dataRequest = `%7B%22user_id%22%3A%22${zaloUserId}%22%7D`;

    const URL = `https://openapi.zalo.me/v2.0/oa/getprofile?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = (await response.json()).data;

    let { user_gender: userGender, display_name: displayName } = jsonResponse;

    userGender === 1 ? (userGender = 'Nam') : (userGender = 'Nữ');

    const result = {
        zaloUserId: zaloUserId,
        displayName: displayName,
        status: 'follow',
        userGender: userGender,
        userPhone: null,
        students: [],
    };
    return result;
}

// async function test() {
//     const accessToken =
//         'A3NA1g2YH44kDC08fgX7GIGsnmMcjpKYAMlO0_E7B4CvJTrSjBqU7s5Dx5cUssX_JYAARA7d26qgBzTuuzWgPMmGrbcWpW9QTLVpHBo-SdLqHVKpbuOICqKOt3cwsZW7QmNTF-Vj6NeF1FuyxF5y9cGrc3U7hdrqHNQTLB6TPcndMUX6aQC51sO-WY2lydqy8oNx8gpQ1pD01yKJhvapBN53rHQkZWSj9K_x2iwq0W8WK-4_puqLAq5dq0s-y0e7I1ln0CFi3X8BS_WNyueGDXzfupFEdZeWB7Jh8zZs1JSXTFmHyUi44Ya3zIsct24dMH-W8AR1S3vCEQuiblL6Q7uzm4cIo3XnIxkljt2dj4z4';
//     const zaloStudentId = '2004001';
//     const zaloUserId = '4966494673333610309';
//     const registerPhone = '0915806944';
//     const aliasName = 'PH Nguyen Van A';

//     await updateFollowerInfo(accessToken, zaloStudentId, zaloUserId, registerPhone, aliasName);
// }

// test().catch(console.dir);

async function updateFollowerInfo(accessToken, studentId, zaloUserId, phone, aliasName) {
    const URL = `https://openapi.zalo.me/v2.0/oa/updatefollowerinfo`;

    const data = {
        address: `${studentId}`,
        user_id: `${zaloUserId}`,
        phone: `${phone}`,
        name: `${aliasName}`,
        district_id: '009',
        city_id: '01',
    };

    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const result = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(data),
    });

    const jsonResponse = await result.json();

    console.log(jsonResponse);
}

async function getConversation(accessToken, zaloUserId) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };
    const offset = 0;
    const count = 10;
    const userId = zaloUserId;

    const URL = `https://openapi.zalo.me/v2.0/oa/conversation?data=%7B%22offset%22%3A${offset}%2C%22user_id%22%3A${userId}%2C%22count%22%3A${count}%7D`;

    const response = await fetch(URL, {
        method: 'get',
        headers: headers,
    });

    const jsonResponse = await response.json();

    return jsonResponse.data;
}

async function sendMessage(accessToken, zaloUserId, message) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v2.0/oa/message?`;

    const content = {
        recipient: { user_id: `${zaloUserId}` },
        message: { text: `${message}` },
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });

    const jsonResponse = await response.json();

    console.log(jsonResponse);
}

async function tagFollower(accessToken, zaloUserId, tagName) {
    const URL = `https://openapi.zalo.me/v2.0/oa/tag/tagfollower`;

    const data = { user_id: zaloUserId, tag_name: tagName };

    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const result = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(data),
    });

    const jsonResponse = await result.json();

    console.log(jsonResponse);
}

async function removeFollowerFromTag(accessToken, zaloUserId, tagName) {
    const URL = 'https://openapi.zalo.me/v2.0/oa/tag/rmfollowerfromtag';

    const data = { user_id: `${zaloUserId}`, tag_name: `${tagName}` };
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(data),
    });

    const jsonResponse = await response.json();

    console.log(jsonResponse);
}

async function sendReaction(accessToken, zaloUserId, messageId, action) {
    const URL = 'https://openapi.zalo.me/v2.0/oa/message';

    const action2ReactIcon = {
        heart: '/-heart',
        sad: ':-((',
        like: '/-strong',
        ':>': ':>',
        '–b': '–b',
        ':-((': ':-((',
        '/-strong': '/-strong',
        '/-heart': '/-heart',
        ':-h': ':-h',
        ':o': ':o',
        '/-remove': '/-remove',
    };

    const data = {
        recipient: {
            user_id: zaloUserId,
        },
        sender_action: {
            react_icon: action2ReactIcon[action],
            react_message_id: messageId,
        },
    };
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(data),
    });

    const jsonResponse = await response.json();

    console.log(jsonResponse);
}

export {
    getFollowers,
    getProfile,
    sendMessage,
    updateFollowerInfo,
    tagFollower,
    removeFollowerFromTag,
    sendReaction,
    getConversation,
};

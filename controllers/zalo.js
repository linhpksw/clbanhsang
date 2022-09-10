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
//     const accessToken = 'D7A95A-AlsSoSuCQgO2yPpXnX1UfdxyrSoUTHFRUmcC_BgXKvw_cU2u9fmZgXUzqD2E_GAZQzdvkVefEgj-pHqaiqakdsenaPbBD4upQZXDUSTPacuYJOMTzotoTpuPW343mQCFuoMadTV5ZoV6mPG1PqMd9u8fRL4toAhdwp5XMI9eheVpSFZ5sXYB6ZhfVEJhSBw2Yb2vOFS9Vd8wOAmmf-GBXgg0J6I3jEiMte3e7GzuvrhgKBXC0y2FfgP4XDZhf3VEelnyw4VWKqRYwEYywWZJKlECI5HgV5EgHr0WoV8akwkFg8G5AhX2TkkSLMXIh6Ok5mp9eShmweT6B77n_iMsZtFfTDAZ03qIedBHY'
//     const zaloStudentId = '';
//     const zaloUserId = '4966494673333610309';
//     const registerPhone = '';
//     const aliasName = '';

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

    // const jsonResponse = await result.json();

    // console.log(jsonResponse);
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

async function sendMessageWithButton(accessToken, zaloUserId, attachMessage) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v2.0/oa/message?`;

    const content = {
        recipient: {
            user_id: zaloUserId,
        },
        message: attachMessage,
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });

    // const jsonResponse = await response.json();

    // console.log(jsonResponse);

    // return jsonResponse;
}

async function sendImageByUrl(accessToken, zaloUserId, message, imageUrl) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v2.0/oa/message`;

    const content = {
        recipient: { user_id: `${zaloUserId}` },
        message: {
            text: message,
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'media',
                    elements: [
                        {
                            media_type: 'image',
                            url: imageUrl,
                        },
                    ],
                },
            },
        },
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });

    // const jsonResponse = await response.json();

    // console.log(jsonResponse);
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

    // const jsonResponse = await response.json();

    // console.log(jsonResponse);

    // return jsonResponse;
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

    // const jsonResponse = await result.json();

    // console.log(jsonResponse);
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

    // const jsonResponse = await response.json();

    // console.log(jsonResponse);
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

    // const jsonResponse = await response.json();

    // console.log(jsonResponse);
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
    sendMessageWithButton,
    sendImageByUrl,
};

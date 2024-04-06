import fetch from 'node-fetch';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

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

        const userData = await getProfile(accessToken, zaloUserId);

        result.push(userData);
    }

    return result;
}

async function getProfile(accessToken, zaloUserId) {
    const dataRequest = `%7B%22user_id%22%3A%22${zaloUserId}%22%7D`;

    const URL = `https://openapi.zalo.me/v3.0/oa/user/detail?data=${dataRequest}`;

    const response = await fetch(URL, {
        method: 'get',
        headers: { access_token: accessToken },
    });

    const jsonResponse = await response.json();

    if (jsonResponse.error !== 0) {
        return null;
    }

    const { display_name: displayName, user_is_follower: isFollow } = jsonResponse.data;

    const result = {
        zaloUserId: zaloUserId,
        displayName: displayName,
        status: isFollow ? 'follow' : 'unfollow',
        userGender: null,
        userPhone: null,
        students: [],
    };

    return result;
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

    const URL = `https://openapi.zalo.me/v3.0/oa/message/cs?`;

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

    const jsonResponse = await response.json();

    console.log(jsonResponse);
}

async function sendImageByUrl(accessToken, zaloUserId, message, imageUrl) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v3.0/oa/message/cs`;

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

    const jsonResponse = await response.json();

    console.log(jsonResponse);
}

async function sendImageByAttachmentId(accessToken, zaloUserId, message, attachmentId) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v3.0/oa/message/cs`;

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
                            attachment_id: attachmentId,
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

    const jsonResponse = await response.json();

    console.log(jsonResponse);
}

async function sendPlusMessage(accessToken, zaloUserId, attachMessage, apiUrl) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const content = {
        recipient: {
            user_id: zaloUserId,
        },
        message: attachMessage,
    };

    const response = await fetch(apiUrl, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });

    const jsonResponse = await response.json();
    console.log(jsonResponse);

    return jsonResponse;
}

async function uploadImage(accessToken, imagePath) {
    let formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));

    try {
        const response = await axios.post('https://openapi.zalo.me/v2.0/oa/upload/image', formData, {
            headers: {
                ...formData.getHeaders(),
                access_token: accessToken,
            },
        });

        if (response.data.error === 0) {
            return response.data.data.attachment_id;
        } else {
            throw new Error(`Image upload failed: ${response.data.message}`);
        }
    } catch (err) {
        console.error(err);
    }
}

async function sendMessage(accessToken, zaloUserId, message) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v3.0/oa/message/cs?`;

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

    return jsonResponse;
}

async function sendInvoice(accessToken, zaloUserId, invoice) {
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v3.0/oa/message/transaction?`;

    const content = {
        recipient: { user_id: zaloUserId },
        message: invoice,
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
    tagFollower,
    removeFollowerFromTag,
    sendReaction,
    getConversation,
    sendMessageWithButton,
    sendImageByUrl,
    sendInvoice,
    sendPlusMessage,
    uploadImage,
    sendImageByAttachmentId,
};

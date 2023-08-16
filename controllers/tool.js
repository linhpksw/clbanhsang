import * as MongoDB from './mongo.js';
import * as ZaloAPI from './zalo.js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import axios from 'axios';

function getStudyDate(startTerm, endTerm, weekday1, weekday2, absent1List, absent2List) {
    const convertWeekday = {
        'Chủ nhật': 0,
        'Thứ 2': 1,
        'Thứ 3': 2,
        'Thứ 4': 3,
        'Thứ 5': 4,
        'Thứ 6': 5,
        'Thứ 7': 6,
    };

    const date = new Date(startTerm.getTime());
    const dates = [];
    while (date <= endTerm) {
        if (date.getDay() === convertWeekday[weekday1] || date.getDay() === convertWeekday[weekday2]) {
            const formatDate = new Date(date).toLocaleDateString('vi-VN');

            dates.push(formatDate);
        }
        date.setDate(date.getDate() + 1);
    }

    const absent = `${absent1List},${absent2List}`
        .replace(/\s+/g, '')
        .split(',')
        .map((date) => {
            const [day, month, year] = date.split('/');
            return `${parseInt(day)}/${parseInt(month)}/${parseInt(year)}`;
        });

    const filteredDate = dates.filter((date) => !absent.includes(date));

    return filteredDate;
}

async function listStudentAttendance(studentId, currentTerm, studentInfoColl) {
    const pipeline = [
        {
            $match: {
                $and: [
                    {
                        studentId: parseInt(studentId),
                    },
                    {
                        'terms.term': parseInt(currentTerm),
                    },
                ],
            },
        },
        {
            $project: {
                _id: 0,
                studentName: 1,
                terms: {
                    $filter: {
                        input: '$terms',
                        as: 'item',
                        cond: {
                            $eq: ['$$item.term', parseInt(currentTerm)],
                        },
                    },
                },
            },
        },
    ];

    const aggCursorStudentAttendance = studentInfoColl.aggregate(pipeline);

    const resultStudentAttendance = await aggCursorStudentAttendance.toArray();

    if (resultStudentAttendance.length === 0) {
        return null;
    } else {
        return resultStudentAttendance;
    }
}

async function signUpRole(accessToken, zaloUserId) {
    const attachMessage = {
        text: `Vui lòng chọn vai trò đăng kí:`,
        attachment: {
            type: 'template',
            payload: {
                buttons: [
                    {
                        title: 'Tôi là phụ huynh',
                        payload: '#dkph',
                        type: 'oa.query.show',
                    },
                    {
                        title: 'Con là học sinh',
                        payload: '#dkhs',
                        type: 'oa.query.show',
                    },
                ],
            },
        },
    };

    await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
}

async function signUpAlert(accessToken, zaloUserId, zaloColl) {
    // Check xem tai khoan da dang ki tren he thong chua
    const isRegister = await MongoDB.findOneUser(zaloColl, { zaloUserId: zaloUserId }, { projection: { _id: 0 } });

    // Neu dang ki roi thi hien thong bao cho PHHS
    if (isRegister.userPhone !== null) {
        const { displayName, userPhone, students } = isRegister;

        const studentRegister = students.map((v) => {
            const { zaloStudentId, zaloClassId, aliasName, role } = v;

            const studentName = aliasName.substring(3);

            return `${studentName} có ID là ${zaloStudentId}`;
        });

        const attachMessage = {
            text: `Zalo ${displayName} đã đăng kí số ${userPhone} với học sinh ${studentRegister.join(', ')}. 
Phụ huynh có muốn đăng kí thêm cho học sinh khác không?
(Nhấn nút bên dưới để xác nhận)`,
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: 'Tôi muốn đăng kí thêm cho học sinh khác',
                            payload: '#vtdk',
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
    }
    // Neu chua thi hien thong bao chon vai tro dang ki
    else {
        await signUpRole(accessToken, zaloUserId);
    }
}

async function signUp4Parent(accessToken, zaloUserId) {
    const message = `👉 Để xác nhận đăng kí tài khoản trên Zalo này, phụ huynh hãy nhập theo đúng cú pháp sau:
dkph IDHS SĐT PH(Đã đăng kí)
---------------------------------------------
👉 Ví dụ: 
dkph 2005xxx 0912345678
---------------------------------------------
👉 Chú ý: 
- SĐT trong cú pháp phải là SĐT đã được đăng kí với lớp toán.
- Tài khoản không nhất thiết phải được đăng kí bằng SĐT đã tạo tài khoản Zalo.
- Mỗi tài khoản Zalo chỉ được liên kết với 1 SĐT đã đăng kí.`;

    await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
}

async function signUp4Student(accessToken, zaloUserId) {
    const message = `👉 Để xác nhận đăng kí tài khoản trên Zalo này, con hãy nhập theo đúng cú pháp sau:
dkhs IDHS SĐT HS (Đã đăng kí)
---------------------------------------------
👉 Ví dụ: 
dkhs 2005xxx 0912345678
---------------------------------------------
👉 Chú ý: 
- SĐT trong cú pháp phải là SĐT đã được đăng kí với lớp toán.
- Tài khoản không nhất thiết phải được đăng kí bằng SĐT đã tạo tài khoản Zalo.
- Mỗi tài khoản Zalo chỉ được liên kết với 1 SĐT đã đăng kí.`;

    await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
}

async function notifyRegister(accessToken, zaloUserId, zaloColl) {
    const isExist = await MongoDB.findOneUser(zaloColl, { zaloUserId: zaloUserId }, { projection: { _id: 0 } });

    if (isExist === null) {
        const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);

        await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

        await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

        await MongoDB.insertOneUser(zaloColl, profileDoc);
    }

    let studentArr = [];

    const { userPhone, students } = isExist;

    if (userPhone === null) {
        const attachMessage = {
            text: 'Phụ huynh cần đăng kí tài khoản để có thể sử dụng tính năng này.',
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: 'Đăng kí tài khoản',
                            payload: '#dktk',
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

        return studentArr;
    } else {
        students.forEach((v) => {
            if (!v.zaloClassId.includes('N')) {
                studentArr.push([v.zaloStudentId, v.zaloClassId, v.role, v.aliasName]);
            }
        });

        if (studentArr.length === 0) {
            const goodByeMessage =
                'Hiện tại phụ huynh đang không có con học tại trung tâm. Chúc phụ huynh một ngày tốt lành!';

            await ZaloAPI.sendMessage(accessToken, zaloUserId, goodByeMessage);
        }

        return studentArr;
    }
}

async function sendClassInfo(accessToken, zaloUserId, classInfoColl, zaloColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [zaloStudentId, zaloClassId, alisaName, role] = zaloStudentInfo[i];

        const classInfo = await MongoDB.findOneUser(
            classInfoColl,
            { classId: zaloClassId },
            { projection: { _id: 0 } }
        );

        const { className, room, currentTerm, totalDate, tuition, startTerm, endTerm, assistants, subjects } =
            classInfo;

        const assistantInfo = assistants
            .map((v) => {
                const { taName, taPhone, taZaloId } = v;

                return `Trợ giảng: ${taName}\nĐiện thoại: ${taPhone}`;
            })
            .join(`\n`);

        const subjectInfo = subjects
            .map((v, i) => {
                const { name, teacher, day, start, end, absent } = v;

                return `${i + 1}) ${name}: ${teacher}\n- ${day}: ${start}-${end}`;
            })
            .join(`\n`);

        const message = `Câu lạc bộ Toán Ánh Sáng xin gửi thông tin lớp ${className} như sau:
------------------------------   
Phòng học: ${room}
------------------------------
${assistants.length ? assistantInfo : `Trợ giảng:\nĐiện thoại:`}
------------------------------
Giáo viên giảng dạy
${subjectInfo}
------------------------------
Đợt hiện tại: ${currentTerm}
Tổng số buổi: ${totalDate} buổi
Bắt đầu đợt: ${startTerm === null ? '' : startTerm}
Kết thúc đợt: ${endTerm === null ? '' : endTerm}
------------------------------
Học phí mỗi buổi: ${tuition}`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
    }
}

async function sendScoreInfo(accessToken, zaloUserId, zaloColl, scoreInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    const currentDate = new Date();
    const currentMonth = currentDate.getUTCMonth();
    const currentYear = currentDate.getUTCFullYear();
    const startDate = new Date(Date.UTC(currentYear, currentMonth, 1));
    const endDate = new Date(Date.UTC(currentYear, currentMonth + 1, 1));

    zaloStudentInfo.forEach(async (v) => {
        const [zaloStudentId, zaloClassId, alisaName, role] = v;

        const studentName = alisaName.substring(3);
        let classNameZalo;

        const assignments = scoreInfoColl
            .find(
                {
                    deadline: {
                        $gte: new Date(startDate),
                        $lt: new Date(endDate),
                    },
                    classId: zaloClassId,
                },
                { projection: { _id: 0, uniqueHash: 0 } }
            )
            .sort({ deadline: -1 });

        // Step 1: Group by subjectName and deadline
        const groupedAssignments = {};

        let checkAverageAll = true;

        await assignments.forEach((assignment) => {
            const {
                deadline,
                delay,
                studentId,
                classId,
                className,
                studentName,
                correct,
                total,
                subjectDate,
                subject,
                status,
                subjectName,
            } = assignment;

            classNameZalo = className;

            if (zaloStudentId == studentId) {
                if (subjectDate !== 'Đủ' || status !== 'Cũ') {
                    checkAverageAll = false;
                }
            }

            const key = `${subjectName}-${subject}-${deadline}`;
            if (!groupedAssignments[key]) {
                groupedAssignments[key] = [];
            }
            groupedAssignments[key].push(assignment);
        });

        let zaloStudentRank = '';
        let zaloStudentScore = 0.0;
        if (checkAverageAll) {
            const studentTotals = {}; //will keep a sum of all scores for each student across assignments.
            const studentCounts = {}; // will keep a count of the number of assignments for each student.

            for (const key in groupedAssignments) {
                const group = groupedAssignments[key];
                group.forEach(({ studentId, correct, total, subjectDate, status }) => {
                    if (subjectDate !== 'Đủ' || status !== 'Cũ') {
                        return;
                    }

                    if (!(studentId in studentTotals)) {
                        studentTotals[studentId] = 0.0;
                        studentCounts[studentId] = 0;
                    }

                    const formatScore = correct === null ? 0.0 : (correct / total) * 10.0;

                    studentTotals[studentId] += formatScore;
                    studentCounts[studentId]++;
                });
            }

            const averages = [];
            for (const studentId in studentTotals) {
                console.log(studentId);
                console.log('studentTotals[studentId]: ' + studentTotals[studentId]);
                console.log('studentCounts[studentId]: ' + studentCounts[studentId]);

                averages.push({
                    studentId: parseInt(studentId),
                    average: Math.round((studentTotals[studentId] / studentCounts[studentId]) * 10) / 10,
                });
            }

            // Rank based on average scores:
            averages.sort((a, b) => b.average - a.average);

            console.log(averages);

            let rankAll = 1;
            let prevAverage = parseFloat(averages[0].average);
            const ranksAll = {};

            averages.forEach((avgObj, idx) => {
                if (avgObj.average !== prevAverage) {
                    rankAll = parseInt(idx + 1);
                }
                ranksAll[avgObj.studentId] = rankAll;
                prevAverage = avgObj.average;
            });

            zaloStudentRank = `Top ${ranksAll[zaloStudentId]}`;
            zaloStudentScore = averages.find((v) => v.studentId === zaloStudentId).average;
        }

        // Step 2 and 3: Compute scores and rank the students
        const rankingInfo = [];

        const convertDate = {
            CN: 0,
            T2: 1,
            T3: 2,
            T4: 3,
            T5: 4,
            T6: 5,
            T7: 6,
        };

        for (const key in groupedAssignments) {
            const group = groupedAssignments[key];

            const scores = group.map((ass) => {
                const { studentId, correct, total, subjectDate, deadline } = ass;
                const deadineDate = new Date(deadline);

                let formatScore;

                if (subjectDate !== 'Đủ' && deadineDate.getDay() !== convertDate[subjectDate]) {
                    formatScore = '';
                } else {
                    formatScore = correct === null ? 0.0 : (correct / total) * 10.0;
                }

                return {
                    studentId: studentId,
                    score: formatScore,
                };
            });

            scores.sort((a, b) => b.score - a.score);

            // Calculate rank
            let rank = 1;
            let prevScore = parseFloat(scores[0].score);
            const ranks = {};

            scores.forEach((scoreObj, idx) => {
                if (scoreObj.score !== prevScore) {
                    rank = parseInt(idx + 1);
                }
                ranks[scoreObj.studentId] = rank;
                prevScore = scoreObj.score;
            });

            const [subjectName, subject, deadline] = key.split('-');

            const deadineDate = new Date(deadline);
            const formatDeadline = `${deadineDate.getDate()}/${deadineDate.getMonth() + 1}`;

            rankingInfo.push({
                subjectName: subjectName,
                subject: subject,
                deadline: formatDeadline,
                scores,
                ranks,
            });
        }

        // Step 4: Convert to 2D format
        const results = [];

        rankingInfo.forEach((info) => {
            const { ranks, scores, deadline, subject, subjectName } = info;

            scores.forEach((scoreObj) => {
                const { studentId, score } = scoreObj;

                if (studentId === zaloStudentId) {
                    results.push([
                        deadline,
                        subject,
                        subjectName,
                        Math.round(score * 10) / 10,
                        `Top ${ranks[studentId]}`,
                    ]);
                }
            });
        });

        const jsonData = {
            className: classNameZalo,
            studentName: studentName,
            aveClassScore: Math.round(zaloStudentScore * 10) / 10,
            rankClass: zaloStudentRank,
            results: results,
            checkAverageAll: checkAverageAll,
        };

        const attachmentId = await captureTableFromJSON(jsonData, accessToken);

        const message = 'Trung tâm Toán Ánh Sáng xin gửi kết quả học tập của con.';

        if (attachmentId) {
            await ZaloAPI.sendImageByAttachmentId(accessToken, zaloUserId, message, attachmentId);
        }

        // await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
    });
}

async function generateTableHTML(className, studentName, aveClassScore, rankClass, results, checkAverageAll) {
    // Construct Header
    const date = new Date();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    const extractRankClass = parseInt(rankClass.split(' ')[1]);
    let rankAllCss;

    if (extractRankClass <= 10) {
        rankAllCss = 'rank-good';
    } else if (extractRankClass <= 20) {
        rankAllCss = 'rank-normal';
    } else {
        rankAllCss = 'rank-bad';
    }

    const tableHTML = `
    <!DOCTYPE html>
<html lang="en">
    <head>
        <link rel="preconnect" href="https://fonts.gstatic.com">
        <link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
        <meta charset="UTF-8">

        <style>
            /* color variables */
            :root {
                --clr-primary: #81d4fa;
                --clr-primary-light: #e1f5fe;
                --clr-primary-dark: #4fc3f7;
                --clr-gray100: #f9fbff;
                --clr-gray150: #f4f6fb;
                --clr-gray200: #eef1f6;
                --clr-gray300: #e1e5ee;
                --clr-gray400: #767b91;
                --clr-gray500: #4f546c;
                --clr-gray600: #2a324b;
                --clr-gray700: #161d34;
                --clr-normal: #fff0c2;
                --clr-normal-font: #a68b00;
                --clr-bad: #ffcdd2;
                --clr-bad-font: #c62828;
                --clr-good: #c8e6c9;
                --clr-good-font: #388e3c;
                --clr-link: #2962ff;
                /* border radius */
                --radius: 0.2rem;
            }
    
            *,
            *::before,
            *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
    
            body {
                font-family: Be Vietnam Pro, sans-serif;
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                color: var(--clr-gray500);
                font-size: 1rem;
                background-color: var(--clr-gray100);
                flex-direction: column;
            }

            .table-wrapper {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            
            .table-section {
                margin-bottom: 2rem; /* Adjust this value to change space between two sections */
            }
    
            table {
                border-collapse: collapse;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                background-color: white;
                text-align: center;
                overflow: hidden;
            }

            .custom-table {
                width: 500px;
            }
    
            table thead {
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            }
    
            th {
                padding: 1rem 1.5rem;
                font-size: 1rem;
                font-weight: 600;
            }
    
            td {
                padding: 1rem 2rem;
            }
    
            .rank {
                display: inline-block;
                border-radius: var(--radius);
                padding: 0.4rem 1rem;
                text-align: center;
            }

            .rank-normal {
                background-color: var(--clr-normal);
                color: var(--clr-normal-font);
            }
    
            .rank-good {
                background-color: var(--clr-good);
                color: var(--clr-good-font);
            }
    
            .rank-bad {
                background-color: var(--clr-bad);
                color: var(--clr-bad-font);
            }

           
            /* Color alternating rows */
            tr:nth-child(even) {
                background-color: var(--clr-gray150);
            }

            .custom-header {
                font-weight: 600;
                color: #e11d48;
                font-size: 1.5rem;
                text-align: center;
                margin-bottom: 0.7rem;
                margin-top: 0.7rem;
            }
        </style>
    </head>
    
    <body>
        <div class="table-wrapper">
            <div class="table-section">${tableHeader}</div>

            <div class="table-section">
                ${detailedTableHeader}
                ${detailedTableRows}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
</html>
    `;

    const tableHeader = !checkAverageAll
        ? ''
        : `
        <p class="custom-header">BẢNG THEO DÕI ĐIỂM HS LỚP ${className} T${month}/${year}</p>
        <table class="custom-table">
            <thead>
                <tr>
                    <th>Tên học sinh</th>
                    <th>Điểm TB</th>
                    <th>Xếp hạng</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${studentName}</td>
                    <td>${aveClassScore}</td>
                    <td><p class="rank ${rankAllCss}">${rankClass}</p></td>
                </tr>
            </tbody>
        </table>`;

    const formatDetail = checkAverageAll
        ? 'CHI TIẾT ĐIỂM SỐ'
        : `CHI TIẾT ĐIỂM SỐ HS ${studentName} LỚP ${className} T${month}/${year}`;

    // Construct detailed table
    const detailedTableHeader = `
        <p class="custom-header">${formatDetail}</p>
        <table>
            <thead>
                <tr>
                    <th>STT</th>
                    <th>Hạn nộp</th>
                    <th>Môn học</th>
                    <th>Tên bài</th>
                    <th>Điểm số</th>
                    <th>Xếp hạng</th>
                </tr>
            </thead>
            <tbody>`;

    let detailedTableRows = '';
    results.forEach((result, index) => {
        const [deadline, subject, subjectName, score, rank] = result;

        const extractRank = parseInt(rank.split(' ')[1]);
        let rankCss;

        if (extractRank <= 10) {
            rankCss = 'rank-good';
        } else if (extractRank <= 20) {
            rankCss = 'rank-normal';
        } else {
            rankCss = 'rank-bad';
        }

        detailedTableRows += `
            <tr>
                <td>${index + 1}</td>
                <td>${deadline}</td>
                <td>${subject}</td>
                <td>${subjectName}</td>
                <td>${score}</td>
                <td><p class="rank ${rankCss}">${rank}</p></td>
            </tr>`;
    });

    // Return full HTML
    return tableHTML;
}

async function captureTableFromJSON(jsonData, accessToken) {
    const { className, studentName, aveClassScore, rankClass, results, checkAverageAll } = jsonData;

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Set viewport for high resolution
    await page.setViewport({
        width: 1000,
        height: 500 + results.length * 50,
        deviceScaleFactor: 3,
    });

    const tableHTML = await generateTableHTML(
        className,
        studentName,
        aveClassScore,
        rankClass,
        results,
        checkAverageAll
    );

    const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const htmlFileName = `temp_${uniqueId}.html`;
    const imageName = `table_${uniqueId}.png`;

    const imagePath = `${__dirname}/${imageName}`;
    const htmlFilePath = `${__dirname}/${htmlFileName}`;

    // Save the tableHTML to a temporary file

    fs.writeFileSync(htmlFilePath, tableHTML);

    // Load the HTML file using page.goto()
    await page.goto(`file://${htmlFilePath}`, { waitUntil: 'networkidle0' });

    await page.screenshot({ path: imagePath, fullPage: true });

    // Remove the temporary file
    fs.unlinkSync(htmlFilePath);

    await browser.close();

    // Upload the captured image
    const attachmentId = await uploadImageToZalo(accessToken, imagePath);

    if (attachmentId) {
        // If needed, remove the image after successful upload.
        fs.unlinkSync(imagePath);
    }
    return attachmentId;
}

async function uploadImageToZalo(accessToken, imagePath) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));

    const config = {
        headers: {
            ...formData.getHeaders(),
            access_token: accessToken,
        },
    };

    try {
        const response = await axios.post('https://openapi.zalo.me/v2.0/oa/upload/image', formData, config);
        if (response.data.error === 0) {
            console.log('Image uploaded successfully!');
            return response.data.data.attachment_id;
        } else {
            console.error('Error uploading image:', response.data.message);
            return null;
        }
    } catch (error) {
        console.error('Failed to upload image:', error.message);
        return null;
    }
}

async function sendAssistantInfo(accessToken, zaloUserId, zaloColl, classInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const studentName = aliasName.slice(3);

        const { currentTerm, className, assistants } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            {
                projection: {
                    _id: 0,
                    currentTerm: 1,
                    className: 1,
                    assistants: 1,
                },
            }
        );

        if (assistants.length === 0) {
            const failContent = `Hiện tại chưa có thông tin trợ giảng của con ${studentName} ${studentId} ở lớp ${className} ạ.`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);
        } else {
            const { taName, taPhone } = assistants[0];

            const successContent = `Lớp toán xin gửi đến ${role.toLowerCase()} ${studentName} ở lớp ${className} số điện thoại chị trợ giảng ${taName} là ${taPhone}.\n\nLớp toán có chức năng tự động chuyển tiếp tin nhắn đến từng trợ giảng quản lí lớp nên tin nhắn sẽ luôn được trả lời trong thời gian sớm nhất. ${role} chỉ nên liên hệ trợ giảng trong trường hợp muốn gọi trực tiếp ạ!`;

            const attachMessage = {
                text: successContent,
                attachment: {
                    type: 'template',
                    payload: {
                        buttons: [
                            {
                                title: `Nhắn tin đến trợ giảng ${taName}`,
                                type: 'oa.open.sms',
                                payload: {
                                    content: `Chào ${taName}, tôi là ${role.toLowerCase()} ${studentName} ở lớp ${className}`,
                                    phone_code: taPhone,
                                },
                            },
                            {
                                title: `Gọi điện đến trợ giảng ${taName}`,
                                type: 'oa.open.phone',
                                payload: {
                                    phone_code: taPhone,
                                },
                            },
                        ],
                    },
                },
            };

            await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
        }
    }
}

async function sendAttendanceInfo(accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const studentName = aliasName.slice(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const studentTermInfo = await listStudentAttendance(studentId, currentTerm, studentInfoColl);

        if (studentTermInfo === null) {
            const failContent = `Dữ liệu điểm danh đợt ${currentTerm} của học sinh ${studentName} ${studentId} lớp ${className} chưa có trên cơ sở dữ liệu. ${role} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

            continue;
        }

        const { terms } = studentTermInfo[0];

        const {
            term, // dot hien tai
            start, // bat dau dot
            end, // ket thuc dot
            total, // so buoi trong dot
            study, // so buoi hoc
            absent, // so buoi nghi
            subject, // mon hoc
            remainderBefore, // du dot truoc
            billing, // phai nop
            payment, // da nop
            type, // hinh thuc nop
            paidDate, // ngay nop
            remainder, // con thua
            attendances,
            absences,
        } = terms[0];

        const attendanceInfo = attendances.map((v) => {
            const { no, newDate, teacher } = v;

            const beautifyDate = formatDate(newDate);

            return `- ${no}: ${teacher} - ${beautifyDate}`;
        });

        const absenceInfo = absences.map((v) => {
            const { no, newDate, teacher } = v;

            const beautifyDate = formatDate(newDate);

            return `- ${no}: ${teacher} - ${beautifyDate}`;
        });

        const message = `Câu lạc bộ Toán Ánh Sáng xin gửi đến ${role.toLowerCase()} ${studentName} ${studentId} lớp ${className} kết quả chuyên cần đợt ${term} như sau:
------------------------
Tổng số buổi đợt ${term}: ${total} buổi
------------------------
Số buổi đã học: ${study} buổi${attendanceInfo.length ? `\n${attendanceInfo.join(`\n`)}` : ''}
------------------------
Số buổi đã nghỉ: ${absent} buổi${absenceInfo.length ? `\n${absenceInfo.join(`\n`)}` : ''}`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, message);
    }
}

async function sendSyntaxPayment(accessToken, zaloUserId, zaloColl, classInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, alisaName] = zaloStudentInfo[i];

        const studentName = alisaName.substring(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const syntaxPayment = `${removeVietNam(studentName)} ${studentId} HPD${currentTerm}`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, syntaxPayment);
    }
}

async function sendPaymentTypeInfo(accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];
        const studentName = aliasName.slice(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const studentTermInfo = await listStudentAttendance(studentId, currentTerm, studentInfoColl);
        const { terms } = studentTermInfo[0];
        const { billing, payment } = terms[0];

        // Truong hop phu huynh chua chuyen khoan
        if (payment !== null || payment < billing || billing.includes('Thừa') || billing.includes('Đã nộp đủ')) {
            const syntaxPayment = `${removeVietNam(studentName)} ${studentId} HPD${currentTerm}`;

            const attachMessage = {
                text: `Phụ huynh có 3 hình thức nộp học phí đợt ${currentTerm} cho học sinh ${studentName} ${studentId} lớp ${className} bao gồm:
-------
1) Học sinh nộp tiền mặt trực tiếp tại lớp toán cho trợ giảng và nhận biên lai về.

2) Phụ huynh chuyển khoản vào tài khoản Đặng Thị Hường – ngân hàng VietinBank, số: 107004444793. Trong nội dung chuyển khoản cần phải ghi đúng nội dung sau để hệ thống cập nhật tự động:
${syntaxPayment}

3) Phụ huynh quét mã QR code phía bên dưới để chuyển khoản.
-------
* Lưu ý: 
- Sau khi chuyển khoản thành công, phụ huynh chụp màn hình ảnh biên lai chuyển khoản vào lại trang Zalo OA của lớp toán.
- Nếu phụ huynh đăng kí từ 2 con trở lên vui lòng chuyển khoản riêng cho từng con ạ.`,

                attachment: {
                    type: 'template',
                    payload: {
                        buttons: [
                            {
                                title: 'Sao chép cú pháp chuyển khoản',
                                payload: '#cpck',
                                type: 'oa.query.show',
                            },
                        ],
                    },
                },
            };

            await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

            // Gui ma QR code cho phu huynh
            const qrCodeContent = `Phụ huynh quét mã QR code trên để thanh toán học phí đợt ${currentTerm} cho con ${studentName}.`;
            const qrCodeUrl = createQRCodePayment(billing, syntaxPayment);

            await ZaloAPI.sendImageByUrl(accessToken, zaloUserId, qrCodeContent, qrCodeUrl);
        }
        // Truong hop phu huynh da chuyen khoan
        else {
            const doneContent = `Phụ huynh đã hoàn thành học phí đợt ${currentTerm} cho con ${studentName} rồi ạ!`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, doneContent);
        }
    }
}

function createQRCodePayment(amount, content) {
    const BANK_ID = 'vietinbank';
    const ACCOUNT_NO = 107004444793;
    const TEMPLATE = 'cJHMwH';
    const ACCOUNT_NAME = encodeURIComponent('Dang Thi Huong');
    const CONTENT = encodeURIComponent(content);

    const qrCodeUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-${TEMPLATE}.png?amount=${amount}&addInfo=${CONTENT}&accountName=${ACCOUNT_NAME}`;
    return qrCodeUrl;
}

async function sendPaymentInfo(accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo.length === 0) {
        return;
    }

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const studentName = aliasName.slice(3);

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const studentTermInfo = await listStudentAttendance(studentId, currentTerm, studentInfoColl);

        if (studentTermInfo === null) {
            const failContent = `Dữ liệu học phí đợt ${currentTerm} của học sinh ${studentName} ${studentId} lớp ${className} chưa có trên cơ sở dữ liệu. ${role} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

            continue;
        }

        const { terms } = studentTermInfo[0];

        const {
            term, // dot hien tai
            start, // bat dau dot
            end, // ket thuc dot
            total, // so buoi trong dot
            study, // so buoi hoc
            absent, // so buoi nghi
            subject, // mon hoc
            remainderBefore, // du dot truoc
            billing, // phai nop
            payment, // da nop
            type, // hinh thuc nop
            paidDate, // ngay nop
            remainder, // con thua
            attendances,
            absences,
        } = terms[0];

        const formatBilling = billing === null ? 'chưa có' : typeof billing === 'string' ? '' : formatCurrency(billing);

        let formatStatus;

        if (typeof billing === 'string' && billing.includes('Đã')) {
            formatStatus = 'Đóng đủ ✅';
        } else {
            if (payment !== null) {
                if (payment > billing) {
                    formatStatus = `thừa ${formatCurrency(payment - billing)} 🔔`;
                } else if (payment < billing) {
                    formatStatus = `thiếu ${formatCurrency(billing - payment)} ❌`;
                } else {
                    formatStatus = 'Đóng đủ ✅';
                }
            } else if (payment === null && typeof billing === 'string' && billing.includes('Thừa')) {
                formatStatus = billing.toLowerCase() + ' 🔔';
            } else {
                formatStatus = 'Chưa đóng ❌';
            }
        }

        const formatRemainder =
            remainder >= 0 ? `thừa ${formatCurrency(remainderBefore)}` : `thiếu ${formatCurrency(remainderBefore)}`;

        const isPaid = payment !== null;

        const isPaidWithScholarship =
            payment === null && typeof billing === 'string' && (billing.includes('Đã') || billing.includes('Thừa'));

        const formatPaid = isPaid
            ? `\n------------------------------------------
Học phí đã nộp: ${formatCurrency(payment)}
Hình thức nộp: ${type}
Ngày nộp: ${paidDate}
${remainder >= 0 ? `Học phí thừa đợt ${term}: ` : `Học phí thiếu ${term}: `}${formatCurrency(remainder)}`
            : '';

        const attachMessageWithButton = {
            text: `Câu lạc bộ Toán Ánh Sáng xin gửi đến ${role.toLowerCase()} ${studentName} ${studentId} lớp ${className} tình trạng học phí đợt ${term} như sau:
------------------------------------------
Bắt đầu đợt: ${formatDate(start)}
Kết thúc đợt: ${formatDate(end)}
------------------------------------------
Buổi học: ${subject}
Tổng số buổi trong đợt: ${total} buổi
Số buổi đã học: ${study} buổi
Số buổi vắng mặt: ${absent} buổi
------------------------------------------
Học phí đợt trước: ${formatRemainder}    
Học phí phải nộp: ${formatBilling}
Tình trạng: ${formatStatus}${formatPaid}
------------------------------------------
Chú ý: số buổi đã học, vắng mặt và học phí còn thừa sẽ tự động được cập nhật sau mỗi buổi học.`,
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: 'Thông tin chuyển khoản',
                            payload: '#ttck',
                            type: 'oa.query.show',
                        },
                        {
                            title: 'Cú pháp chuyển khoản',
                            payload: '#cpck',
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        const simpleMessage = `Câu lạc bộ Toán Ánh Sáng xin gửi đến ${role.toLowerCase()} ${studentName} ${studentId} lớp ${className} tình trạng học phí đợt ${term} như sau:
------------------------------------------
Bắt đầu đợt: ${formatDate(start)}
Kết thúc đợt: ${formatDate(end)}
------------------------------------------
Buổi học: ${subject}
Tổng số buổi trong đợt: ${total} buổi
Số buổi đã học: ${study} buổi
Số buổi vắng mặt: ${absent} buổi
------------------------------------------
Học phí đợt trước: ${formatRemainder}    
Học phí phải nộp: ${formatBilling}
Tình trạng: ${formatStatus}${formatPaid}
------------------------------------------
Chú ý: số buổi đã học, vắng mặt và học phí còn thừa sẽ tự động được cập nhật sau mỗi buổi học.`;
        if (isPaid || isPaidWithScholarship) {
            await ZaloAPI.sendMessage(accessToken, zaloUserId, simpleMessage);
        } else {
            await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessageWithButton);
        }
    }
}

function removeVietNam(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function formatDate(dateStr) {
    const date = new Date(dateStr);

    return date.toLocaleDateString('vi-VN');
}

function formatDateTime(dateStr) {
    const newDate = new Date(dateStr);

    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    };

    return newDate.toLocaleString('vi-VN', options);
}

function formatCurrency(money) {
    return `${Math.abs(money).toLocaleString('vi-VN')} đ`;
}

function nomarlizeSyntax(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, '');
}

function createDate(dateStr) {
    const [day, month, year] = dateStr.split('/');

    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

async function findZaloIdFromStudentId(zaloColl, zaloStudentId, role) {
    const cursor = zaloColl.find(
        {
            'students.zaloStudentId': parseInt(zaloStudentId),
            'students.role': role,
        },
        { projection: { _id: 0, zaloUserId: 1, 'students.$': 1 } }
    );

    let zaloIdArr = [];
    await cursor.forEach((v) => {
        zaloIdArr.push([v.zaloUserId, v.students[0].zaloClassId]);
    });
    // Do la classId nen khong thanh van de vi neu co truong hop ca 2 hs khac ID thi do $ match ket qua dau tien dung nen van duoc

    return zaloIdArr;
}

async function sendMessage2Assistant(accessToken, classInfoColl, classId, forwardContent) {
    const result = await MongoDB.findOneUser(
        classInfoColl,
        { classId: classId },
        { projection: { _id: 0, assistants: 1 } }
    );

    const isExistAssistant = result !== null;

    if (isExistAssistant) {
        const { assistants } = result;

        for (let i = 0; i < assistants.length; i++) {
            const assistant = assistants[i];
            const { taZaloId } = assistant;

            await ZaloAPI.sendMessage(accessToken, taZaloId, forwardContent);
        }
    }
}

async function sendResponse2Client(accessToken, zaloUserId, messageId, responseContent, action) {
    ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, action);

    await ZaloAPI.sendMessage(accessToken, zaloUserId, responseContent);
}

async function getContentFromMsgId(accessToken, zaloUserId, messageId) {
    const conversation = await ZaloAPI.getConversation(accessToken, zaloUserId);

    if (conversation !== undefined) {
        for (let i = 0; i < conversation.length; i++) {
            const { message_id, message } = conversation[i];

            if (message_id === messageId) {
                return message;
            }
        }
    } else {
        return undefined;
    }
}

async function sendUnfollow2Assistant(accessToken, zaloUserId, zaloColl, classInfoColl) {
    const parentInfo = await MongoDB.findOneUser(zaloColl, { zaloUserId: zaloUserId }, { projection: { _id: 0 } });

    if (parentInfo != null) {
        await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');

        await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa quan tâm');

        MongoDB.updateOneUser(zaloColl, { zaloUserId: `${zaloUserId}` }, { $set: { status: 'unfollow' } });

        const { students, displayName } = parentInfo;

        for (let i = 0; i < students.length; i++) {
            const { zaloStudentId, zaloClassId, aliasName } = students[i];

            const assistantInfo = await MongoDB.findOneUser(
                classInfoColl,
                { classId: zaloClassId },
                { projection: { _id: 0, assistants: 1 } }
            );

            if (assistantInfo !== null) {
                const { assistants } = assistantInfo;

                for (let j = 0; j < assistants.length; j++) {
                    const { taZaloId } = assistants[j];

                    const unfollowContent = `${aliasName} (${zaloStudentId}) với tên Zalo ${displayName} đã hủy theo dõi OA.\n\nTrợ giảng hãy kiểm tra nguyên nhân.`;

                    await ZaloAPI.sendMessage(accessToken, taZaloId, unfollowContent);
                }
            }
        }
    }
}

async function sendReactBack2Parent(accessToken, zaloUserId, messageId, reactIcon, zaloColl) {
    const content = await getContentFromMsgId(accessToken, zaloUserId, messageId);

    if (content !== undefined) {
        const [UID, MID] = content.split('\n\n').at(-1).split(`\n`);

        const zaloId = await findZaloIdFromUserPhone(zaloColl, UID.split(' ')[1]);
        const zaloMessageId = MID.split(' ')[1];

        if (zaloId !== null) {
            await ZaloAPI.sendReaction(accessToken, zaloId, zaloMessageId, reactIcon);
        }
    }
}

async function sendImageBack2Parent(accessToken, imageInfo, zaloColl) {
    // Kiem tra noi dung anh co chua noi dung khong
    const isContainPhoneNum = imageInfo.hasOwnProperty('text');

    // Kiem tra xem co chua so dien thoai khong
    if (isContainPhoneNum) {
        const isValidPhone = imageInfo.text.length === 10;

        if (isValidPhone) {
            const { attachments, text: userPhone } = imageInfo;

            const imageUrl = attachments[0].payload.url;

            const zaloUserId = await findZaloIdFromUserPhone(zaloColl, userPhone);

            await ZaloAPI.sendImageByUrl(accessToken, zaloUserId, '', imageUrl);
        }
    }
}

async function findZaloIdFromUserPhone(zaloColl, userPhone) {
    const result = await MongoDB.findOneUser(
        zaloColl,
        { userPhone: userPhone },
        { projection: { _id: 0, zaloUserId: 1 } }
    );

    if (result !== null) {
        return result.zaloUserId;
    } else {
        return null;
    }
}

async function sendMessageBack2Parent(accessToken, zaloUserId, replyContent, quoteMessageId, zaloColl) {
    const conversation = await ZaloAPI.getConversation(accessToken, zaloUserId);

    for (let i = 0; i < conversation.length; i++) {
        const { message_id, message } = conversation[i];

        if (typeof message === 'string') {
            if (message_id === quoteMessageId) {
                const [UID, MID] = message.split('\n\n').at(-1).split(`\n`);

                const zaloId = await findZaloIdFromUserPhone(zaloColl, UID.split(' ')[1]);
                const zaloMessageId = MID.split(' ')[1];

                await ZaloAPI.sendMessage(accessToken, zaloId, replyContent);

                break; // Chi can tim thay ID tin nhan la huy vong lap luon
            }
        }
    }
}

async function sendImage2Assistant(res, accessToken, classInfoColl, zaloClassId, attachments, forwardImageContent) {
    const imageUrl = attachments[0].payload.url;

    const { assistants } = await MongoDB.findOneUser(
        classInfoColl,
        { classId: zaloClassId },
        { projection: { _id: 0, assistants: 1 } }
    );

    for (let i = 0; i < assistants.length; i++) {
        const assistant = assistants[i];
        const { taZaloId } = assistant;

        await ZaloAPI.sendImageByUrl(accessToken, taZaloId, forwardImageContent, imageUrl);
    }
}

async function forwardImage2Assistant(res, accessToken, zaloUserId, zaloColl, classInfoColl, imageInfo) {
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, students: 1, userPhone: 1, displayName: 1 } }
    );

    // PHHS chua dang ki tai khoan thi khong nhan lai
    if (isRegister.students.length === 0) {
        return;
    }
    // PHHS da dang ki tai khoan thi chuyen tiep toi tro giang
    else {
        const { attachments, text: content, msg_id: messageId } = imageInfo;
        const { userPhone, displayName } = isRegister;

        // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
        for (let i = 0; i < isRegister.students.length; i++) {
            const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

            // chuyen tiep tin nhan den tro giang tuong ung
            const forwardImageContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi ảnh${
                content === undefined ? ':' : ` với nội dung: ${content}.`
            }\n\nUID: ${userPhone}`;

            await sendImage2Assistant(res, accessToken, classInfoColl, zaloClassId, attachments, forwardImageContent);
        }
    }
}

async function forwardMessage2Assistant(accessToken, zaloUserId, messageId, zaloColl, classInfoColl, content) {
    const zaloInfo = await MongoDB.findOneUser(zaloColl, { zaloUserId: `${zaloUserId}` }, { projection: { _id: 0 } });

    const isExist = zaloInfo !== null;

    if (isExist) {
        const isRegister = zaloInfo.students.length !== 0;

        // PHHS da dang ki tai khoan
        if (isRegister) {
            const { userPhone, displayName } = zaloInfo;

            const totalStudent = zaloInfo.students.length;

            for (let i = 0; i < totalStudent; i++) {
                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                const { zaloStudentId, zaloClassId, aliasName } = zaloInfo.students[i];

                // chuyen tiep tin nhan den tro giang tuong ung
                const forwardContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi tin:\n${content}\n\nUID: ${userPhone}\nMID: ${messageId}`;

                await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardContent);
            }
        }
    }
}

async function isManagerCheck(zaloUserId, classInfoColl) {
    const result = await MongoDB.findOneUser(
        classInfoColl,
        { 'assistants.taZaloId': zaloUserId },
        { projection: { _id: 0 } }
    );

    return result === null ? false : true;
}

async function isFollow(zaloUserId, accessToken) {
    const response = await ZaloAPI.getProfile(accessToken, zaloUserId);

    return response ? true : false;
}

async function signUp4Assistant(res, accessToken, taZaloId, classInfoColl, zaloColl, content, messageId) {
    // dktg 2009A0 0915806944 Trọng Linh
    if (content.length < 24) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Trợ giảng hãy nhập lại.`;
        sendResponse2Client(res, accessToken, taZaloId, messageId, failContent, 'sad');
        return;
    }

    const [syntax, classId, taPhone, ...splitName] = content.split(' ');

    const taName = splitName.join(' ').replace(/\s+/g, ' ').trim();

    // check xem da co tro giang tren he thong chua
    const isAssistantExist = await MongoDB.findOneUser(
        classInfoColl,
        { 'assistants.taPhone': taPhone, classId: classId },
        { projection: { _id: 0, assistants: 1 } }
    );

    // Neu chua ton tai thi tao moi

    if (isAssistantExist === null) {
        // Cap nhat tag tren Zalo OA Chat
        await ZaloAPI.tagFollower(accessToken, taZaloId, 'Trợ giảng');
        await ZaloAPI.tagFollower(accessToken, taZaloId, classId);

        await MongoDB.updateOneUser(
            classInfoColl,
            { classId: classId },
            {
                $push: {
                    assistants: {
                        taName: taName,
                        taPhone: taPhone,
                        taZaloId: taZaloId,
                    },
                },
            }
        );

        MongoDB.updateOneUser(zaloColl, { zaloUserId: taZaloId }, { $set: { userPhone: taPhone } });

        const successContent = `✅ Đăng kí thành công cho trợ giảng ${taName} với mã lớp ${classId} và số điện thoại ${taPhone}.`;

        await sendResponse2Client(accessToken, taZaloId, messageId, successContent, 'heart');

        await ZaloAPI.removeFollowerFromTag(accessToken, taZaloId, 'Chưa đăng kí');
    } else {
        // Neu ton tai roi thi:

        const failContent = `❌ Đăng kí thất bại vì trợ giảng ${taName} đã liên kết với mã lớp ${classId}.`;

        await sendResponse2Client(accessToken, taZaloId, messageId, failContent, 'sad');
    }
}

async function deleteAccount(formatContent, accessToken, taZaloId, zaloColl, classInfoColl, messageId, zaloRole) {
    // Check xem co phai do Tro giang nhan khong
    const isManager = await isManagerCheck(taZaloId, classInfoColl);

    // Neu tu tro giang
    if (isManager) {
        const TOTAL_DELETE_SYNTAX = 20;
        const isValidDeleteSyntax = formatContent.length === TOTAL_DELETE_SYNTAX;

        // Neu cu phap dung
        if (isValidDeleteSyntax) {
            const targetStudentId = parseInt(formatContent.substring(3, 10));
            const registerPhone = formatContent.slice(-10);

            // Xoa tag va thong tin tren Zalo OA chat

            const cursor = zaloColl.find(
                {
                    'students.zaloStudentId': targetStudentId,
                    userPhone: registerPhone,
                },
                { projection: { _id: 0 } }
            );

            const documents = await cursor.toArray();
            for (const v of documents) {
                const { zaloUserId, students, displayName } = v;

                // Xoa tag lop hoc
                for (let i = 0; i < students.length; i++) {
                    const removeTag = students[i].zaloClassId;

                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, removeTag);
                }

                // Xoa tag Phu huynh/Hoc sinh
                ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, zaloRole);
                ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

                // Xoa dang ki tai khoan trong Zalo Coll
                MongoDB.updateOneUser(
                    zaloColl,
                    { userPhone: registerPhone, 'students.zaloStudentId': targetStudentId },
                    { $set: { userPhone: null, students: [] } }
                );

                // Gui xac nhan den PHHS
                const sendResponse2DeleteUser = `Trợ giảng đã xoá số điện thoại ${registerPhone} được đăng kí với học sinh ${targetStudentId} trên Zalo ${displayName}.`;

                await ZaloAPI.sendMessage(accessToken, zaloUserId, sendResponse2DeleteUser);

                // Gui xac nhan den Tro giang
                const successContent = `🗑️ Xoá thành công số điện thoại ${registerPhone} được đăng kí với học sinh ${targetStudentId} trên Zalo ${displayName}.`;

                await ZaloAPI.sendReaction(accessToken, taZaloId, messageId, 'heart');

                await ZaloAPI.sendMessage(accessToken, taZaloId, successContent);
            }
        }

        // Neu cu phap sai
        else {
            const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Trợ giảng hãy nhập lại.`;

            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);
        }
    }

    // Neu tu PHHS thi khong co hieu luc
    else {
        const warningMessage = 'Tính năng tính năng này chỉ dành cho tài khoản là trợ giảng của lớp toán.';

        await ZaloAPI.sendMessage(accessToken, taZaloId, warningMessage);
    }
}

async function signUp(accessToken, zaloUserId, zaloColl, classColl, classInfoColl, formatContent, messageId, zaloRole) {
    // dkph 2004001 0123456789
    const TOTAL_REGISTER_SYNTAX = 21;
    const isValidRegisterSyntax = formatContent.length === TOTAL_REGISTER_SYNTAX;

    if (isValidRegisterSyntax) {
        const targetStudentId = parseInt(formatContent.substring(4, 11));

        const registerPhone = formatContent.slice(-10);

        const isExistInZaloColl = await MongoDB.findOneUser(
            zaloColl,
            { zaloUserId: `${zaloUserId}` },
            { projection: { _id: 0 } }
        );

        // Neu phu huynh chua co du lieu trong Zalo Coll
        // Neu nguoi dung quan tam lan dau
        if (isExistInZaloColl === null) {
            const profileDoc = await ZaloAPI.getProfile(accessToken, zaloUserId);

            await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

            await ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

            await MongoDB.insertOneUser(zaloColl, profileDoc);
        }

        const { userPhone, students, displayName } = isExistInZaloColl;

        // Kiem tra sdt dang ki co match voi so da ton tai hoac chua ton tai so nao
        const isNotYetRegister = userPhone === null;
        const isMatch = userPhone === registerPhone;
        const isNotMatch = userPhone !== registerPhone;

        // Neu chua tung dang ky bao gio (dang ki lan dau tien)
        if (isNotYetRegister) {
            let zaloStudentIdArr = [];
            let zaloClassIdArr = [];
            let aliasNameArr = [];

            // kiem tra tren class collection
            const classUserInfo = await MongoDB.findOneUser(
                classColl,
                { studentId: targetStudentId },
                { projection: { _id: 0 } }
            );

            const isExistStudentId = classUserInfo !== null;

            // Neu ton tai Id tren he thong
            if (isExistStudentId) {
                const { firstParentPhone, secondParentPhone, studentPhone, fullName, classId } = classUserInfo;

                let registerPhoneList;

                if (zaloRole === 'Phụ huynh') {
                    registerPhoneList = [firstParentPhone, secondParentPhone];
                } else {
                    registerPhoneList = [studentPhone];
                }

                const isContainRegisterPhone = registerPhoneList.includes(registerPhone);

                // Neu sdt nam trong ds dang ki
                if (isContainRegisterPhone) {
                    // set up role cho zalo user
                    const classInfo = await MongoDB.findOneUser(
                        classInfoColl,
                        { classId: classId },
                        { projection: { _id: 0, className: 1 } }
                    );

                    const isExistClassInfo = classInfo !== null;

                    // Neu ton tai ma lop
                    if (isExistClassInfo) {
                        const { className } = classInfo;

                        const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được đăng kí với học sinh ${fullName} có ID là ${targetStudentId} ở lớp ${className}.\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

                        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'heart');

                        await ZaloAPI.sendMessage(accessToken, zaloUserId, successContent);

                        const zaloRole2Short = {
                            'Phụ huynh': 'PH',
                            'Học sinh': 'HS',
                        };

                        // them class id moi
                        zaloClassIdArr.push(classId);
                        // them id hs moi
                        zaloStudentIdArr.push(targetStudentId);
                        // them alias moi
                        aliasNameArr.push(`${zaloRole2Short[zaloRole]} ${fullName}`);

                        // Cap nhat tag tren Zalo OA Chat
                        ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
                        ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassIdArr.at(-1));
                        ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');
                        ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

                        // cap nhat role cho PHHS trong Zalo Collection
                        MongoDB.updateOneUser(
                            zaloColl,
                            { zaloUserId: `${zaloUserId}` },
                            {
                                $set: {
                                    userPhone: `${registerPhone}`,
                                },
                                $push: {
                                    students: {
                                        zaloStudentId: targetStudentId,
                                        zaloClassId: classId,
                                        aliasName: `${zaloRole2Short[zaloRole]} ${fullName}`,
                                        role: zaloRole,
                                    },
                                },
                            }
                        );

                        return successContent;
                    }

                    // Neu ma lop chua ton tai
                    else {
                        const failContent = `❌ Đăng kí thất bại!\n\nLớp ${classId} chưa được tạo trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                        await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                        return failContent;
                    }
                }
                // Neu khong nam trong ds dang ki
                else {
                    const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                    await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                    await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                    return failContent;
                }
            }

            // Neu khong ton tai Id tren he thong
            else {
                const failContent = `❌ Đăng kí thất bại!\n\nID học sinh ${targetStudentId} không tồn tại trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                return failContent;
            }
        }

        // Neu match voi sdt dki (dang ki them cho hs khac)
        else if (isMatch) {
            // Kiem tra sdt trong cu phap da duoc lien ket voi IDHS chua
            let linkStudentIdList = [];
            for (let i = 0; i < students.length; i++) {
                const { zaloStudentId } = students[i];

                linkStudentIdList.push(parseInt(zaloStudentId));
            }

            const isLinked = linkStudentIdList.includes(targetStudentId);

            // Neu da duoc lien ket
            if (isLinked) {
                const failContent = `⭐ Thông báo!\n\nSố điện thoại ${registerPhone} đã được đăng kí với ID học sinh ${targetStudentId}. Phụ huynh không cần phải đăng kí lại nữa ạ.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 số điện thoại đã được đăng kí với học sinh trước đó. Nếu có nhu cầu chuyển đổi tài khoản, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

                await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'like');

                await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                return failContent;
            }

            // Neu sdt chua duoc lien ket voi hoc sinh nay
            else {
                let zaloStudentIdArr = [];
                let zaloClassIdArr = [];
                let aliasNameArr = [];

                // Neu sdt da dang ki voi 1 hoc sinh khac
                if (students.length > 0) {
                    students.forEach((v) => {
                        const { zaloStudentId, zaloClassId, aliasName } = v;
                        zaloStudentIdArr.push(zaloStudentId);
                        zaloClassIdArr.push(zaloClassId);
                        aliasNameArr.push(aliasName);
                    });
                }

                // kiem tra tren class collection
                const classUserInfo = await MongoDB.findOneUser(
                    classColl,
                    { studentId: targetStudentId },
                    { projection: { _id: 0 } }
                );

                const isExistStudentId = classUserInfo !== null;

                // Neu ton tai Id tren he thong
                if (isExistStudentId) {
                    const { firstParentPhone, secondParentPhone, studentPhone, fullName, classId } = classUserInfo;

                    let registerPhoneList;

                    if (zaloRole === 'Phụ huynh') {
                        registerPhoneList = [firstParentPhone, secondParentPhone];
                    } else {
                        registerPhoneList = [studentPhone];
                    }

                    const isContainRegisterPhone = registerPhoneList.includes(registerPhone);

                    // Neu sdt nam trong ds dang ki
                    if (isContainRegisterPhone) {
                        // set up role cho zalo user
                        const classInfo = await MongoDB.findOneUser(
                            classInfoColl,
                            { classId: classId },
                            { projection: { _id: 0, className: 1 } }
                        );

                        const isExistClassInfo = classInfo !== null;

                        // Neu ton tai ma lop
                        if (isExistClassInfo) {
                            const { className } = classInfo;

                            const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được đăng kí với học sinh ${fullName} có ID là ${targetStudentId} ở lớp ${className}.\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

                            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'heart');

                            await ZaloAPI.sendMessage(accessToken, zaloUserId, successContent);

                            const zaloRole2Short = {
                                'Phụ huynh': 'PH',
                                'Học sinh': 'HS',
                            };

                            // them class id moi
                            zaloClassIdArr.push(classId);
                            // them id hs moi
                            zaloStudentIdArr.push(targetStudentId);
                            // them alias moi
                            aliasNameArr.push(`${zaloRole2Short[zaloRole]} ${fullName}`);

                            // Cap nhat tag tren Zalo OA Chat
                            ZaloAPI.tagFollower(accessToken, zaloUserId, zaloRole);
                            ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassIdArr.at(-1));
                            ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa đăng kí');
                            ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, 'Chưa quan tâm');

                            // cap nhat role cho PHHS trong Zalo Collection
                            MongoDB.updateOneUser(
                                zaloColl,
                                { zaloUserId: `${zaloUserId}` },
                                {
                                    $set: {
                                        userPhone: `${registerPhone}`,
                                    },
                                    $push: {
                                        students: {
                                            zaloStudentId: targetStudentId,
                                            zaloClassId: classId,
                                            aliasName: `${zaloRole2Short[zaloRole]} ${fullName}`,
                                            role: zaloRole,
                                        },
                                    },
                                }
                            );

                            return successContent;
                        }

                        // Neu ma lop chua ton tai
                        else {
                            const failContent = `❌ Đăng kí thất bại!\n\nLớp ${classId} chưa được tạo trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                            return failContent;
                        }
                    }
                    // Neu khong nam trong ds dang ki
                    else {
                        const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                        await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                        return failContent;
                    }
                }

                // Neu khong ton tai Id tren he thong
                else {
                    const failContent = `❌ Đăng kí thất bại!\n\nID học sinh ${targetStudentId} không tồn tại trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

                    await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

                    await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

                    return failContent;
                }
            }
        }

        // Neu khong match voi sdt dang ki (da co tai khoan khac dang ki Zalo nay roi)
        else if (isNotMatch) {
            const failContent = `⭐ Thông báo!\n\nĐã có 1 số điện thoại khác đăng kí với tài khoản Zalo này.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 số điện thoại đã được đăng kí với học sinh trước đó. Nếu có nhu cầu chuyển đổi tài khoản, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

            await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'like');

            await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

            return failContent;
        }
    }

    // Neu sai cu phap dang ki tai khoan
    else {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Mã ID học sinh phải gồm 7 kí tự và số điện thoại gồm 10 số. ${zaloRole} hãy kiểm tra và nhập lại.`;

        await ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, 'sad');

        await ZaloAPI.sendMessage(accessToken, zaloUserId, failContent);

        return failContent;
    }
}

export {
    sendUnfollow2Assistant,
    nomarlizeSyntax,
    signUp,
    isFollow,
    signUp4Assistant,
    forwardMessage2Assistant,
    isManagerCheck,
    sendMessageBack2Parent,
    sendMessage2Assistant,
    findZaloIdFromStudentId,
    sendReactBack2Parent,
    deleteAccount,
    notifyRegister,
    sendClassInfo,
    createDate,
    formatDate,
    formatDateTime,
    formatCurrency,
    removeVietNam,
    sendSyntaxPayment,
    sendPaymentTypeInfo,
    sendPaymentInfo,
    sendAttendanceInfo,
    signUpAlert,
    signUpRole,
    signUp4Parent,
    signUp4Student,
    forwardImage2Assistant,
    sendImageBack2Parent,
    sendAssistantInfo,
    getStudyDate,
    sendScoreInfo,
};

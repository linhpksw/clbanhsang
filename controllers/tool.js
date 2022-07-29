import * as MongoDB from './mongo.js';
import * as ZaloAPI from './zalo.js';

function getStudyDate(startTerm, endTerm, weekday1, weekday2, absent1, absent2) {
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
    const absent = `${absent1},${absent2}`
        .replace(/\s+/g, '')
        .split(',')
        .map((date) => {
            const [day, month, year] = date.split('/');
            return `${month}/${day}/${year}`;
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

async function listStudentNotPayment(classId, currentTerm, studentInfoColl) {
    // Lay danh sach hoc sinh chua nop hoc phi dot x lop y
    const pipeline = [
        {
            $match: {
                $and: [
                    {
                        classId: classId,
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
                studentId: 1,
                studentName: 1,
                terms: {
                    $filter: {
                        input: '$terms',
                        as: 'item',
                        cond: {
                            $and: [
                                { $eq: ['$$item.term', parseInt(currentTerm)] },
                                { $eq: ['$$item.payment', null] },
                                { $isNumber: '$$item.billing' },
                            ],
                        },
                    },
                },
            },
        },
    ];

    const aggCursorStudentNotPayment = studentInfoColl.aggregate(pipeline);

    const resultStudentNotPayment = await aggCursorStudentNotPayment.toArray();

    // Loc danh sach nhung hoc sinh chua nop hoc phi
    const studentNotPayment = resultStudentNotPayment.filter((v) => v.terms.length === 1);

    return studentNotPayment;
}

async function alarmStudentNotPayment2Parent(
    res,
    accessToken,
    zaloUserId,
    classId,
    zaloColl,
    studentInfoColl,
    classInfoColl
) {
    const studentNotPayment = await listStudentNotPayment(classId, currentTerm, studentInfoColl);

    const { className, startTerm, endTerm, subjects } = await MongoDB.findOneUser(
        classInfoColl,
        { classId: classId },
        { projection: { _id: 0, className: 1 } }
    );
    const createStartTerm = createDate(startTerm);
    const createEndTerm = createDate(endTerm);

    const weekday1 = subjects[0].day;
    const absent1 = subjects[0].absent;
    const weekday2 = subjects[1].day;
    const absent2 = subjects[1].absent;

    const duePayment = getStudyDate(
        createStartTerm,
        createEndTerm,
        weekday1,
        weekday2,
        ...absent1,
        ...absent2
    );

    const duePaymentTermOne = duePayment[4];
    const duePaymentOtherTerm = duePayment[2];

    let listSendSuccess = [];
    let listSendFail = [];

    for (let i = 0; i < studentNotPayment.length; i++) {
        const { studentId, studentName, terms } = studentNotPayment[i];

        const { term, remainderBefore, billing } = terms[0];

        const alarmContent = `Câu lạc bộ Toán Ánh Sáng xin thông báo học phí đợt ${term} của em ${studentName} ${studentId} lớp ${className} như sau:
- Học phí từ đợt trước: ${
            remainderBefore === 0
                ? '0 đ'
                : remainderBefore > 0
                ? `thừa ${formatCurrency(remainderBefore)}`
                : `thiếu ${formatCurrency(remainderBefore)}`
        }
-Học phí phải nộp đợt ${term} này: ${formatCurrency(billing)}

Phụ huynh cần hoàn thành học phí trước hạn ngày ${
            term === 1 ? duePaymentTermOne : duePaymentOtherTerm
        } cho lớp toán. Trân trọng!`;

        const attachMessage = {
            text: alarmContent,
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: `Thông tin chuyển khoản`,
                            payload: `#ttck`,
                            type: 'oa.query.show',
                        },
                        {
                            title: `Cú pháp chuyển khoản`,
                            payload: `#cpck`,
                            type: 'oa.query.show',
                        },
                        {
                            title: `Cụ thể học phí đợt ${term}`,
                            payload: `#hpht`,
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        const parentIdArr = await findZaloIdFromStudentId(zaloColl);

        for (let v = 0; v < parentIdArr.length; v++) {
            const parentId = parentIdArr[v];

            const jsonResponse = await ZaloAPI.sendMessageWithButton(accessToken, parentId, attachMessage);

            if (jsonResponse.error === 0) {
                listSendSuccess.push(`${i + 1}) ${studentName} ${studentId}`);
            } else {
                listSendFail.push(`${i + 1}) ${studentName} ${studentId}`);
            }
        }
    }

    const sendingResult = `Kết quả gửi tin nhắn thông báo học phí lớp ${classId}:
A, Số tin nhắn gửi thành công: ${listSendSuccess.length}
${listSendSuccess.join(`\n\n`)}

B, Số tin nhắn gửi thất bại: ${listSendFail.length}
${listSendSuccess.join(`\n\n`)}`;

    // Gui lai thong ke ket qua gui cho tro giang
    await ZaloAPI.sendMessage(accessToken, zaloUserId, sendingResult);

    res.send('Done!');

    return;
}

async function sendStudentNotPayment(res, accessToken, zaloUserId, classId, studentInfoColl, classInfoColl) {
    const { currentTerm } = await MongoDB.findOneUser(
        classInfoColl,
        { classId: classId },
        { projection: { _id: 0, currentTerm: 1 } }
    );

    const studentNotPayment = await listStudentNotPayment(classId, currentTerm, studentInfoColl);

    // Neu tat ca hoc sinh da hoan thanh hoc phi
    if (studentNotPayment.length === 0) {
        // Thong bao lai cho tro giang
        const notFoundStudentPaymentContent = `Lớp ${classId} đã hoàn thành học phí đợt ${currentTerm}. Chúc mừng trợ giảng ❤️`;

        await ZaloAPI.sendMessage(accessToken, zaloUserId, notFoundStudentPaymentContent);
    }
    // Neu co hoc sinh chua nop hoc thi gui danh sach chua nop hoc cho tro giang
    else {
        const writeStudentNotPayment = studentNotPayment.map((v, i) => {
            const { studentId, studentName, terms } = v;
            const { billing } = terms[0];

            return `${i + 1}) ${studentName} ${studentId}: ${formatCurrency(billing)}`;
        });

        // Gui tin
        const studentNotPaymentContent = `Danh sách chưa nộp học lớp ${classId} đợt ${currentTerm} là:\n\n${writeStudentNotPayment.join(
            `\n\n`
        )}`;

        const attachMessage = {
            text: studentNotPaymentContent,
            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: `Nhắc tất cả PH chưa nộp lớp ${classId}`,
                            payload: `#cnhph${classId}`,
                            type: 'oa.query.show',
                        },
                        {
                            title: `Nhắc tất cả PH trừ 1 số HS cụ thể lớp ${classId}`,
                            payload: {
                                content: `Để nhắc tất cả phụ huynh lớp ${classId} chưa nộp học phí nhưng trừ 1 số học sinh cụ thể thì trợ giảng gửi theo cú pháp sau:\n\n#cnhph${classId}-${classId.slice(
                                    0,
                                    4
                                )}001,${classId.slice(0, 4)}002`,
                                phone_code: '0375830815',
                            },
                            type: 'oa.open.sms',
                        },
                        {
                            title: `Nhắc cụ thể riêng những HS lớp ${classId}`,
                            payload: {
                                content: `Để nhắc chỉ riêng một số phụ huynh thì trợ giảng gửi theo cú pháp sau:\n\n#cnhph${classId}+${classId.slice(
                                    0,
                                    4
                                )}001,${classId.slice(0, 4)}002`,
                                phone_code: '0375830815',
                            },
                            type: 'oa.open.sms',
                        },
                    ],
                },
            },
        };

        await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
    }

    await res.send('Done');

    return;
}

async function checkRegister(
    res,
    accessToken,
    zaloUserId,
    classInfoColl,
    zaloColl,
    classColl,
    classId,
    syntax
) {
    // Check xem co phai tu Tro giang nhan khong
    if (!(await isManager(zaloUserId, classInfoColl))) {
        const warningMessage = 'Tính năng tính năng này chỉ dành cho tài khoản là trợ giảng của lớp toán.';
        await ZaloAPI.sendMessage(accessToken, zaloUserId, warningMessage);

        res.send('Done!');
        return;
    }

    if (syntax.includes('ph')) {
        // Lay danh sach hoc sinh da co phu huynh dang ki lop xx (Dang hoc)
        const cursorParentRegister = zaloColl.find(
            { 'students.zaloClassId': classId, 'students.role': 'Phụ huynh' },
            { projection: { _id: 0, students: 1, displayName: 1, userPhone: 1 } }
        );

        let parentRegisters = [];

        const resultParentRegister = await cursorParentRegister.toArray();

        switch (syntax) {
            case '#dkph':
                // Lay danh sach hoc sinh da co phu huynh dang ki lop xx (Dang hoc)
                resultParentRegister.forEach((v) => {
                    const { displayName, userPhone, students } = v;

                    students.forEach((e) => {
                        const { zaloStudentId, zaloClassId, aliasName } = e;

                        if (zaloClassId === classId) {
                            const studentName = aliasName.slice(3);
                            const objIndex = parentRegisters.findIndex(
                                (obj) => obj.studentId == zaloStudentId
                            );

                            // Kiem tra hoc sinh da co phu huynh dang ki chua
                            // Neu co roi thi day them vao
                            if (objIndex !== -1) {
                                parentRegisters[objIndex].parents.push({
                                    parentName: displayName,
                                    parentPhone: userPhone,
                                });
                            }
                            // Neu chua thi them moi
                            else {
                                parentRegisters.push({
                                    studentName: studentName,
                                    studentId: zaloStudentId,
                                    parents: [
                                        {
                                            parentName: displayName,
                                            parentPhone: userPhone,
                                        },
                                    ],
                                });
                            }
                        }
                    });
                });

                // Tao danh sach PH dang ki
                const writeParentRegisters = parentRegisters.map((v, i) => {
                    const { studentName, studentId, parents } = v;

                    const listParents = parents.map((e) => {
                        const { parentName, parentPhone } = e;

                        return `- PH ${parentName} ${parentPhone}`;
                    });

                    return `${i + 1}) ${studentName} ${studentId}\n${listParents.join(`\n`)}`;
                });

                // Gui tin den tro giang
                const parentRegistersContent = `Danh sách học sinh đã có phụ huynh đăng kí lớp ${classId}:\n\n${writeParentRegisters.join(
                    `\n\n`
                )}`;

                await ZaloAPI.sendMessage(accessToken, zaloUserId, parentRegistersContent);

                break;

            case '#cdkph':
                // Lay danh sach hoc sinh dang hoc tai lop
                const cursorStudents = classColl.find(
                    { classId: classId },
                    { projection: { _id: 0, studentId: 1, fullName: 1 } }
                );

                let studentLists = [];

                await cursorStudents.forEach((v) => {
                    const { studentId, fullName } = v;

                    studentLists.push([studentId, fullName]);
                });

                // Lay danh sach hoc sinh da co phu huynh dang ki lop xx (Dang hoc)
                resultParentRegister.forEach((v) => {
                    const { displayName, userPhone, students } = v;

                    students.forEach((e) => {
                        const { zaloStudentId, zaloClassId, aliasName } = e;

                        if (zaloClassId === classId) {
                            parentRegisters.push(zaloStudentId);
                        }
                    });
                });

                // Loc ra danh sach hoc sinh chua co phu huynh dang ki
                const parentNotRegisters = studentLists.filter((v) => !parentRegisters.includes(v[0]));

                // Tao danh sach PH chua dang ki
                const writeParentNotRegisters = parentNotRegisters.map((v, i) => {
                    const [studentId, fullName] = v;

                    return `${i + 1}) ${fullName} ${studentId}`;
                });

                // Gui tin den tro giang
                const parentNotRegistersContent = `Danh sách học sinh chưa có phụ huynh đăng kí lớp ${classId}:\n\n${writeParentNotRegisters.join(
                    `\n\n`
                )}`;

                await ZaloAPI.sendMessage(accessToken, zaloUserId, parentNotRegistersContent);

                break;
        }
    } else if (syntax.includes('hs')) {
        // Lay danh sach hoc sinh da dang ki lop xx (Dang hoc)
        const cursorStudentRegister = zaloColl.find(
            { 'students.zaloClassId': classId, 'students.role': 'Học sinh' },
            { projection: { _id: 0, students: 1, displayName: 1, userPhone: 1 } }
        );

        const resultStudentRegister = await cursorStudentRegister.toArray();

        let studentRegisters = [];

        switch (syntax) {
            case '#dkhs':
                // Lay danh sach hoc sinh da dang ki lop xx (Dang hoc)
                resultStudentRegister.forEach((v) => {
                    const { displayName, userPhone, students } = v;

                    students.forEach((e) => {
                        const { zaloStudentId, zaloClassId, aliasName } = e;

                        if (zaloClassId === classId) {
                            const studentName = aliasName.slice(3);
                            studentRegisters.push({
                                studentName: studentName,
                                studentId: zaloStudentId,
                                studentPhone: userPhone,
                            });
                        }
                    });
                });
                // Tao danh sach hoc sinh dang ki
                const writeStudentRegisters = studentRegisters.map((v, i) => {
                    const { studentName, studentId, studentPhone } = v;

                    return `${i + 1}) ${studentId} ${studentName} ${studentPhone}`;
                });

                // Gui tin den tro giang
                const studentRegistersContent = `Danh sách học sinh đã đăng kí lớp ${classId}:\n\n${writeStudentRegisters.join(
                    `\n\n`
                )}`;

                await ZaloAPI.sendMessage(accessToken, zaloUserId, studentRegistersContent);

                break;

            case '#cdkhs':
                // Lay danh sach hoc sinh dang hoc tai lop
                const cursorStudent = classColl.find(
                    { classId: classId },
                    { projection: { _id: 0, studentId: 1, fullName: 1 } }
                );

                let studentLists = [];
                await cursorStudent.forEach((v) => {
                    const { studentId, fullName } = v;
                    studentLists.push([studentId, fullName]);
                });

                // Lay danh sach hoc sinh da dang ki lop xx (Dang hoc)
                resultStudentRegister.forEach((v) => {
                    const { displayName, userPhone, students } = v;

                    students.forEach((e) => {
                        const { zaloStudentId, zaloClassId, aliasName } = e;

                        if (zaloClassId === classId) {
                            studentRegisters.push(zaloStudentId);
                        }
                    });
                });

                // Loc ra danh sach hoc sinh chua dang ki
                const studentNotRegisters = studentLists.filter((v) => !studentRegisters.includes(v[0]));

                // Tao danh sach hoc sinh chua dang ki
                const writeStudentNotRegisters = studentNotRegisters.map((v, i) => {
                    const [studentId, fullName] = v;

                    return `${i + 1}) ${fullName} ${studentId}`;
                });

                // Gui tin den tro giang
                const studentNotRegistersContent = `Danh sách học sinh chưa đăng kí lớp ${classId}:\n\n${writeStudentNotRegisters.join(
                    `\n\n`
                )}`;

                await ZaloAPI.sendMessage(accessToken, zaloUserId, studentNotRegistersContent);

                break;
        }
    }

    res.send('Done');

    return;
}

async function assistantMenu(res, accessToken, taZaloId, classInfoColl) {
    // Check xem co phai do Tro giang nhan khong
    if (!(await isManager(taZaloId, classInfoColl))) {
        const warningMessage = 'Tính năng tính năng này chỉ dành cho tài khoản là trợ giảng của lớp toán.';
        await ZaloAPI.sendMessage(accessToken, taZaloId, warningMessage);

        res.send('Done!');
        return;
    }

    const attachMessage = {
        text: `Các tính năng dành cho trợ giảng:`,
        attachment: {
            type: 'template',
            payload: {
                buttons: [
                    {
                        title: 'Kiểm tra đăng kí',
                        payload: '#ktdk',
                        type: 'oa.query.hide',
                    },
                    {
                        title: 'Nhắc các học sinh không có mặt hôm nay',
                        payload: '#dkhs',
                        type: 'oa.query.hide',
                    },
                    {
                        title: 'Nhắc các học sinh không nộp bài',
                        payload: '#dkhs',
                        type: 'oa.query.hide',
                    },
                    {
                        title: 'Nhắc các học sinh chưa nộp học',
                        payload: '#dkhs',
                        type: 'oa.query.hide',
                    },
                ],
            },
        },
    };

    await ZaloAPI.sendMessageWithButton(accessToken, taZaloId, attachMessage);

    res.send('Done!');

    return;
}

async function signUpRole(res, accessToken, zaloUserId) {
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

    res.send('Done!');

    return;
}

async function signUpAlert(res, accessToken, zaloUserId, zaloColl) {
    // Check xem tai khoan da dang ki tren he thong chua
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: zaloUserId },
        { projection: { _id: 0 } }
    );

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

        res.send('Done!');

        return;
    }
    // Neu chua thi hien thong bao chon vai tro dang ki
    else {
        await signUpRole(res, accessToken, zaloUserId);
    }
}

async function signUp4Parent(res, accessToken, zaloUserId) {
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

    res.send('Done!');

    return;
}

async function signUp4Student(res, accessToken, zaloUserId) {
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

    res.send('Done!');

    return;
}

async function notifyRegister(res, accessToken, zaloUserId, zaloColl) {
    const { students } = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: zaloUserId },
        { projection: { _id: 0, students: 1 } }
    );

    if (students === null || students.length === 0) {
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

        res.send('Done!');

        return;
    } else {
        const studentZaloInfo = students.map((v) => {
            return [v.zaloStudentId, v.zaloClassId, v.role, v.aliasName];
        });

        return studentZaloInfo;
    }
}

async function sendPublicClassInfo(res, accessToken, zaloUserId, classInfoColl, classId) {
    const classInfo = await MongoDB.findOneUser(
        classInfoColl,
        { classId: classId },
        { projection: { _id: 0 } }
    );

    const {
        className,
        room,
        description,
        status,
        currentTerm,
        totalDate,
        tuition,
        startTerm,
        endTerm,
        assistants,
        subjects,
    } = classInfo;

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

    res.send('Done!');

    return;
}

async function sendClassInfo(res, accessToken, zaloUserId, classInfoColl, zaloColl) {
    const zaloStudentInfo = await notifyRegister(res, accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo === undefined) return;

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [zaloStudentId, zaloClassId, alisaName, role] = zaloStudentInfo[i];

        const classInfo = await MongoDB.findOneUser(
            classInfoColl,
            { classId: zaloClassId },
            { projection: { _id: 0 } }
        );

        const {
            className,
            room,
            description,
            status,
            currentTerm,
            totalDate,
            tuition,
            startTerm,
            endTerm,
            assistants,
            subjects,
        } = classInfo;

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

    res.send('Done!');

    return;
}

async function sendAssistantInfo(res, accessToken, zaloUserId, zaloColl, classInfoColl) {
    const zaloStudentInfo = await notifyRegister(res, accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo === undefined) return;

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const studentName = aliasName.slice(3);

        const { currentTerm, className, assistants } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1, assistants: 1 } }
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

    res.send('Done!');

    return;
}

async function sendAttendanceInfo(res, accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(res, accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo === undefined) return;

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

            res.send('Done!');

            return;
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

        res.send('Done!');

        return;
    }
}

async function sendSyntaxPayment(res, accessToken, zaloUserId, zaloColl, classInfoColl) {
    const zaloStudentInfo = await notifyRegister(res, accessToken, zaloUserId, zaloColl);

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

        res.send('Done!');

        return;
    }
}

async function sendPaymentTypeInfo(res, accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(res, accessToken, zaloUserId, zaloColl);

    for (let i = 0; i < zaloStudentInfo.length; i++) {
        const [studentId, classId, role, aliasName] = zaloStudentInfo[i];

        const { currentTerm, className } = await MongoDB.findOneUser(
            classInfoColl,
            { classId: classId },
            { projection: { _id: 0, currentTerm: 1, className: 1 } }
        );

        const studentTermInfo = await listStudentAttendance(studentId, currentTerm, studentInfoColl);

        const { studentName, terms } = studentTermInfo[0];

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

        const attachMessage = {
            text: `Phụ huynh có 2 hình thức nộp học phí đợt ${term} cho học sinh ${studentName} lớp ${className} bao gồm:
1) Học sinh nộp tiền mặt trực tiếp tại lớp toán cho trợ giảng và nhận biên lai về.
2) ${role} chuyển khoản vào tài khoản Đặng Thị Hường – ngân hàng VietinBank chi nhánh Chương Dương, số: 107004444793.
    
* Lưu ý quan trọng: ${role.toLowerCase()} cần sao chép đúng cú pháp dưới đây và dán trong nội dung chuyển khoản. Sau khi chuyển khoản thành công, ${role.toLowerCase()} chụp màn hình ảnh xác nhận chuyển khoản thành công vào lại trang Zalo OA của lớp toán.`,

            attachment: {
                type: 'template',
                payload: {
                    buttons: [
                        {
                            title: 'Sao chép cú pháp chuyển khoản này',
                            payload: '#cpck',
                            type: 'oa.query.show',
                        },
                    ],
                },
            },
        };

        await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);
    }
}

async function sendPaymentInfo(res, accessToken, zaloUserId, zaloColl, classInfoColl, studentInfoColl) {
    const zaloStudentInfo = await notifyRegister(res, accessToken, zaloUserId, zaloColl);

    if (zaloStudentInfo === undefined) return;

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

            res.send('Done!');

            return;
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

        const attachMessage = {
            text: `Câu lạc bộ Toán Ánh Sáng xin gửi đến ${role.toLowerCase()} ${studentName} ${studentId} lớp ${className} tình trạng học phí đợt ${term} như sau:
------------------------
Học phí phải nộp: ${formatCurrency(billing)}
Tình trạng: ${
                payment !== null
                    ? payment === billing
                        ? 'Đóng đủ ✅'
                        : payment > billing
                        ? `thừa ${formatCurrency(payment - billing)} 🔔`
                        : `thiếu ${formatCurrency(billing - payment)} ❌`
                    : 'Chưa đóng ❌'
            }${
                remainderBefore === 0
                    ? ''
                    : `\nHọc phí từ đợt trước: ${remainderBefore > 0 ? 'thừa' : 'thiếu'} ${formatCurrency(
                          remainderBefore
                      )}`
            }              
------------------------
Bắt đầu đợt: ${formatDate(start)}
Kết thúc đợt: ${formatDate(end)}
------------------------
Buổi học: ${subject}
Tổng số buổi trong đợt: ${total} buổi
Số buổi đã học: ${study} buổi
Số buổi vắng mặt: ${absent} buổi${
                payment === null
                    ? ''
                    : `\n------------------------
Học phí đã nộp: ${formatCurrency(payment)}
Hình thức nộp: ${type}
Ngày nộp: ${paidDate}
${remainder >= 0 ? `Học phí thừa đợt ${term}: ` : `Học phí thiếu ${term}: `}${formatCurrency(remainder)}`
            }`,

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

        await ZaloAPI.sendMessageWithButton(accessToken, zaloUserId, attachMessage);

        // const startTerm = new Date(term);
        // const today = new Date();
        // const difference = Math.round((today - startTerm) / 86400 / 1000);

        // if (difference > 3 && payment === null) {
        // }

        res.send('Done!');

        return;
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

async function findZaloIdFromStudentId(zaloColl, zaloStudentId) {
    const cursor = zaloColl.find(
        { 'students.zaloStudentId': parseInt(zaloStudentId) },
        { projection: { _id: 0, zaloUserId: 1, students: 1 } }
    );

    let zaloIdArr = [];
    await cursor.forEach((v) => {
        zaloIdArr.push([v.zaloUserId, v.students[0].zaloClassId]);
    });

    return zaloIdArr;
}

async function sendMessage2Assistant(accessToken, classInfoColl, classId, forwardContent) {
    const { assistants } = await MongoDB.findOneUser(
        classInfoColl,
        { classId: classId },
        { projection: { _id: 0, assistants: 1 } }
    );

    for (let i = 0; i < assistants.length; i++) {
        const assistant = assistants[i];
        const { taZaloId } = assistant;

        await ZaloAPI.sendMessage(accessToken, taZaloId, forwardContent);
    }
}

async function sendResponse2Client(res, accessToken, zaloUserId, messageId, responseContent, action) {
    ZaloAPI.sendReaction(accessToken, zaloUserId, messageId, action);

    await ZaloAPI.sendMessage(accessToken, zaloUserId, responseContent);

    res.send('Done!');
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

async function sendReactBack2Parent(accessToken, zaloUserId, messageId, reactIcon, zaloColl) {
    const content = await getContentFromMsgId(accessToken, zaloUserId, messageId);

    if (content !== undefined) {
        const [UID, MID] = content.split('\n\n').at(-1).split(`\n`);

        const zaloId = await findZaloIdFromUserPhone(zaloColl, UID.split(' ')[1]);
        const zaloMessageId = MID.split(' ')[1];

        await ZaloAPI.sendReaction(accessToken, zaloId, zaloMessageId, reactIcon);
    }
}

async function sendImageBack2Parent(res, accessToken, imageInfo, zaloColl) {
    const { attachments, text: userPhone } = imageInfo;
    const imageUrl = attachments[0].payload.url;

    const zaloUserId = await findZaloIdFromUserPhone(zaloColl, userPhone);

    await ZaloAPI.sendImageByUrl(accessToken, zaloUserId, '', imageUrl);

    res.send('Done');

    return;
}

async function findZaloIdFromUserPhone(zaloColl, userPhone) {
    const result = await MongoDB.findOneUser(
        zaloColl,
        { userPhone: userPhone },
        { projection: { _id: 0, zaloUserId: 1 } }
    );

    return result.zaloUserId;
}

async function sendMessageBack2Parent(res, accessToken, zaloUserId, replyContent, quoteMessageId, zaloColl) {
    const conversation = await ZaloAPI.getConversation(accessToken, zaloUserId);

    for (let i = 0; i < conversation.length; i++) {
        const { message_id, message } = conversation[i];

        if (typeof message === 'string') {
            if (message_id === quoteMessageId) {
                const [UID, MID] = message.split('\n\n').at(-1).split(`\n`);

                const zaloId = await findZaloIdFromUserPhone(zaloColl, UID.split(' ')[1]);
                const zaloMessageId = MID.split(' ')[1];

                await ZaloAPI.sendMessage(accessToken, zaloId, replyContent);

                break;
            }
        }
    }

    res.send('Done');

    return;
}

async function sendImage2Assistant(
    res,
    accessToken,
    classInfoColl,
    zaloClassId,
    attachments,
    forwardImageContent
) {
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

    res.send('Done!');

    return;
}

async function forwardOtherMedia2Assistant(
    res,
    accessToken,
    zaloUserId,
    zaloColl,
    classInfoColl,
    mediaInfo,
    localeTimeStamp
) {
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, students: 1, userPhone: 1, displayName: 1 } }
    );

    // PHHS chua dang ki tai khoan thi khong nhan lai
    if (isRegister.students.length === 0) {
        await res.send('Done');
        return;
    }
    // PHHS da dang ki tai khoan thi chuyen tiep toi tro giang
    else {
        const { userPhone, displayName } = isRegister;

        const { attachments, text: content, msg_id: messageId } = mediaInfo;
        const { payload, type } = attachments[0];

        switch (type) {
            case 'link':
                const { description: descLink, url: urlLink } = payload;

                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                for (let i = 0; i < isRegister.students.length; i++) {
                    const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

                    // chuyen tiep tin nhan den tro giang tuong ung
                    const forwardMediaContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi link: ${urlLink} \n\nUID: ${userPhone}\nMID: ${messageId}`;

                    await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardMediaContent);
                }

                break;

            case 'sticker':
                const { url: urlSticker } = payload;

                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                for (let i = 0; i < isRegister.students.length; i++) {
                    const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

                    // chuyen tiep tin nhan den tro giang tuong ung
                    const forwardMediaContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi sticker: ${urlSticker} \n\nUID: ${userPhone}\nMID: ${messageId}`;

                    await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardMediaContent);
                }

                break;

            case 'video':
                const { description: descVideo, url: urlVideo } = payload;

                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                for (let i = 0; i < isRegister.students.length; i++) {
                    const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

                    // chuyen tiep tin nhan den tro giang tuong ung
                    const forwardMediaContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi video: ${urlVideo} \n\nUID: ${userPhone}\nMID: ${messageId}`;

                    await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardMediaContent);
                }

                break;

            case 'file':
                const { url: urlFile, size: sizeFile, name: nameFile, type: typeFile } = payload;

                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                for (let i = 0; i < isRegister.students.length; i++) {
                    const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

                    // chuyen tiep tin nhan den tro giang tuong ung
                    const forwardMediaContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi file: ${nameFile}\nLink: ${urlFile} \n\nUID: ${userPhone}\nMID: ${messageId}`;

                    await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardMediaContent);
                }

                break;

            case 'audio':
                const { url: urlAudio } = payload;

                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                for (let i = 0; i < isRegister.students.length; i++) {
                    const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

                    // chuyen tiep tin nhan den tro giang tuong ung
                    const forwardMediaContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi voice: ${urlAudio}\n\nUID: ${userPhone}\nMID: ${messageId}`;

                    await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardMediaContent);
                }
                break;

            case 'image':
                const { url: urlImage } = payload;

                // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
                for (let i = 0; i < isRegister.students.length; i++) {
                    const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

                    // chuyen tiep tin nhan den tro giang tuong ung
                    const forwardMediaContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi ảnh: ${urlImage}\n\nUID: ${userPhone}\nMID: ${messageId}`;

                    await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardMediaContent);
                }
                break;
        }
    }
}

async function forwardImage2Assistant(
    res,
    accessToken,
    zaloUserId,
    zaloColl,
    classInfoColl,
    imageInfo,
    localeTimeStamp
) {
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, students: 1, userPhone: 1, displayName: 1 } }
    );

    // PHHS chua dang ki tai khoan thi khong nhan lai
    if (isRegister.students.length === 0) {
        await res.send('Done');
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

            await sendImage2Assistant(
                res,
                accessToken,
                classInfoColl,
                zaloClassId,
                attachments,
                forwardImageContent
            );
        }
    }
}

async function forwardMessage2Assistant(
    res,
    accessToken,
    zaloUserId,
    messageId,
    zaloColl,
    classInfoColl,
    content,
    localeTimeStamp
) {
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, students: 1, userPhone: 1, displayName: 1 } }
    );

    if (isRegister.students.length === 0) {
        // PHHS chua dang ki tai khoan
        await res.send('Done');
        return;
    } else {
        // PHHS da dang ki tai khoan
        const { userPhone, displayName } = isRegister;
        for (let i = 0; i < isRegister.students.length; i++) {
            // Vong lap vi co truong hop 1 tai khoan Zalo dki 2 HS
            const { zaloStudentId, zaloClassId, aliasName } = isRegister.students[i];

            // chuyen tiep tin nhan den tro giang tuong ung
            const forwardContent = `${aliasName} (${displayName}) ${zaloStudentId} lớp ${zaloClassId} đã gửi tin:\n${content}\n\nUID: ${userPhone}\nMID: ${messageId}`;

            await sendMessage2Assistant(accessToken, classInfoColl, zaloClassId, forwardContent);

            await res.send('Done');

            return;
        }
    }
}

async function isManager(zaloUserId, classInfoColl) {
    const result = await MongoDB.findOneUser(
        classInfoColl,
        { 'assistants.taZaloId': zaloUserId },
        { projection: { _id: 0 } }
    );

    if (result === null) {
        return false;
    }

    return true;
}

async function isFollow(zaloUserId, zaloColl) {
    const result = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: zaloUserId },
        { projection: { _id: 0, status: 1 } }
    );

    if (result === null || result.status === 'unfollow') {
        return false;
    }

    return true;
}

async function signUp4Assistant(res, accessToken, taZaloId, classInfoColl, zaloColl, content, messageId) {
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

        await sendResponse2Client(res, accessToken, taZaloId, messageId, successContent, 'heart');

        return;
    } else {
        // Neu ton tai roi thi:

        const failContent = `❌ Đăng kí thất bại vì trợ giảng ${taName} đã liên kết với mã lớp ${classId}.`;

        await sendResponse2Client(res, accessToken, taZaloId, messageId, failContent, 'sad');

        return;
    }
}

async function deleteAccount(
    res,
    formatContent,
    accessToken,
    taZaloId,
    zaloColl,
    classInfoColl,
    messageId,
    zaloRole
) {
    // Check xem co phai do Tro giang nhan khong
    if (!(await isManager(taZaloId, classInfoColl))) {
        const warningMessage = 'Tính năng tính năng này chỉ dành cho tài khoản là trợ giảng của lớp toán.';
        await ZaloAPI.sendMessage(accessToken, taZaloId, warningMessage);

        res.send('Done!');
        return;
    }

    if (formatContent.length !== 20) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. Trợ giảng hãy nhập lại.`;
        sendResponse2Client(res, accessToken, taZaloId, messageId, failContent, 'sad');
        return;
    }

    const targetStudentId = parseInt(formatContent.substring(3, 10));
    const registerPhone = formatContent.slice(-10);

    // Xoa tag va thong tin tren Zalo OA chat
    const { zaloUserId, students, displayName } = await MongoDB.findOneUser(
        zaloColl,
        { userPhone: registerPhone },
        { projection: { _id: 0, zaloUserId: 1, students: 1, displayName: 1 } }
    );

    for (let i = 0; i < students.length; i++) {
        const removeTag = students[i].zaloClassId;

        await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, removeTag);
    }
    ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, zaloRole);
    ZaloAPI.tagFollower(accessToken, zaloUserId, 'Chưa đăng kí');

    // Xoa dang ki tai khoan trong Zalo Coll
    MongoDB.updateOneUser(
        zaloColl,
        { userPhone: registerPhone },
        { $set: { userPhone: null, students: [] } }
    );

    const sendResponse2DeleteUser = `Zalo ${displayName} đã xoá thành công số điện thoại ${registerPhone} được đăng kí với học sinh ${targetStudentId} bởi trợ giảng.`;

    await ZaloAPI.sendMessage(accessToken, zaloUserId, sendResponse2DeleteUser);

    const successContent = `🗑️ Xoá thành công số điện thoại ${registerPhone} được đăng kí với học sinh ${targetStudentId} trên Zalo ${displayName}.`;

    await sendResponse2Client(res, accessToken, taZaloId, messageId, successContent, 'heart');

    return;
}

async function signUp(
    res,
    accessToken,
    zaloUserId,
    zaloColl,
    classColl,
    classInfoColl,
    formatContent,
    messageId,
    zaloRole
) {
    if (formatContent.length !== 21) {
        const failContent = `❌ Đăng kí thất bại!\n\nCú pháp không đúng. ${zaloRole} hãy nhập lại.`;
        sendResponse2Client(res, accessToken, zaloUserId, messageId, failContent, 'sad');
        return;
    }

    const targetStudentId = parseInt(formatContent.substring(4, 11));
    const registerPhone = formatContent.slice(-10);

    // Kiem tra sdt trong cu phap da duoc lien ket voi IDHS chua
    const isRegister = await MongoDB.findOneUser(
        zaloColl,
        {
            userPhone: registerPhone,
            'students.zaloStudentId': parseInt(targetStudentId),
        },
        { projection: { _id: 0 } }
    );

    if (isRegister !== null) {
        if (isRegister.userPhone !== registerPhone) {
            const failContent = `⭐ Thông báo!\n\nĐã có 1 số điện thoại khác đăng kí với ID học sinh ${targetStudentId}.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 số điện thoại đã được đăng kí với học sinh trước đó. Nếu có nhu cầu chuyển đổi tài khoản, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

            await sendResponse2Client(res, accessToken, zaloUserId, messageId, failContent, 'like');

            res.send('Done!');

            return;
        }
        const failContent = `⭐ Thông báo!\n\nSố điện thoại ${registerPhone} đã được đăng kí với ID học sinh ${targetStudentId}.\n\n${zaloRole} lưu ý:\nMỗi tài khoản Zalo chỉ được liên kết với 1 số điện thoại đã được đăng kí với học sinh trước đó. Nếu có nhu cầu chuyển đổi tài khoản, ${zaloRole} vui lòng liên hệ với trợ giảng để được hỗ trợ.`;

        await sendResponse2Client(res, accessToken, zaloUserId, messageId, failContent, 'like');

        res.send('Done!');

        return;
    }

    const zaloUserInfo = await MongoDB.findOneUser(
        zaloColl,
        { zaloUserId: `${zaloUserId}` },
        { projection: { _id: 0, displayName: 1, students: 1 } }
    );

    const { displayName, students } = zaloUserInfo;

    let zaloStudentIdArr = [];
    let zaloClassIdArr = [];
    let aliasNameArr = [];

    if (students.length > 0) {
        students.forEach((v) => {
            const { zaloStudentId, zaloClassId, aliasName } = v;
            zaloStudentIdArr.push(zaloStudentId);
            zaloClassIdArr.push(zaloClassId);
            aliasNameArr.push(aliasName);
        });
    }

    // kiem tra tren classes collection
    const classUserInfo = await MongoDB.findOneUser(
        classColl,
        { studentId: targetStudentId },
        {
            projection: {
                _id: 0,
                fullName: 1,
                classId: 1,
                leaveDate: 1,
                studentPhone: 1,
                firstParentPhone: 1,
                secondParentPhone: 1,
            },
        }
    );

    if (classUserInfo === null) {
        const failContent = `❌ Đăng kí thất bại!\n\nID học sinh ${targetStudentId} không có trên hệ thống. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(res, accessToken, zaloUserId, messageId, failContent, 'sad');

        return;
    }

    const { firstParentPhone, secondParentPhone, studentPhone, fullName, classId } = classUserInfo;

    let registerPhoneList;

    if (zaloRole === 'Phụ huynh') {
        registerPhoneList = [firstParentPhone, secondParentPhone];
    } else {
        registerPhoneList = [studentPhone];
    }

    if (!registerPhoneList.includes(registerPhone)) {
        const failContent = `❌ Đăng kí thất bại!\n\nSố điện thoại ${registerPhone} chưa có trong danh sách đã đăng kí. ${zaloRole} hãy liên hệ với trợ giảng để được hỗ trợ.`;

        sendResponse2Client(res, accessToken, zaloUserId, messageId, failContent, 'sad');

        return;
    }
    // set up role cho zalo user
    const { className } = await MongoDB.findOneUser(
        classInfoColl,
        { classId: classId },
        { projection: { _id: 0, className: 1 } }
    );
    const successContent = `✅ Đăng kí thành công!\n\nZalo ${displayName} đã được đăng kí với học sinh ${fullName} có ID là ${targetStudentId} ở lớp ${className}.\n\n${zaloRole} đã có thể sử dụng đầy đủ các tính năng của lớp toán ở mục tiện ích bên dưới.`;

    sendResponse2Client(res, accessToken, zaloUserId, messageId, successContent, 'heart');

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

    // cap nhat role cho PHHS trong Zalo Collection
    const filter = { zaloUserId: `${zaloUserId}` };

    const updateDoc = {
        $set: { userPhone: `${registerPhone}` },
        $push: {
            students: {
                zaloStudentId: targetStudentId,
                zaloClassId: classId,
                aliasName: `${zaloRole2Short[zaloRole]} ${fullName}`,
                role: zaloRole,
            },
        },
    };

    MongoDB.updateOneUser(zaloColl, filter, updateDoc);

    // Cap nhat thong tin tren Zalo OA Chat
    let formatZaloStudentId = [];
    let formatAliasName = [];

    zaloStudentIdArr.length === 1
        ? (formatZaloStudentId = zaloStudentIdArr[0])
        : (formatZaloStudentId = zaloStudentIdArr.join(', '));

    aliasNameArr.length === 1
        ? (formatAliasName = aliasNameArr[0])
        : (formatAliasName = aliasNameArr.join(', '));

    ZaloAPI.updateFollowerInfo(accessToken, formatZaloStudentId, zaloUserId, registerPhone, formatAliasName);

    return;
}

export {
    nomarlizeSyntax,
    signUp,
    isFollow,
    signUp4Assistant,
    forwardMessage2Assistant,
    isManager,
    sendMessageBack2Parent,
    sendMessage2Assistant,
    findZaloIdFromStudentId,
    sendReactBack2Parent,
    deleteAccount,
    notifyRegister,
    sendClassInfo,
    sendPublicClassInfo,
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
    forwardOtherMedia2Assistant,
    sendAssistantInfo,
    assistantMenu,
    checkRegister,
    sendStudentNotPayment,
    getStudyDate,
};

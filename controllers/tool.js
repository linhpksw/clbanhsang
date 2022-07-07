function xoaDauTiengViet(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function nomarlizeSyntax(str) {
    return xoaDauTiengViet(str).toLowerCase().replace(/\s+/g, '');
}

export { nomarlizeSyntax };

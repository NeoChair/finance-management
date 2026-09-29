export type SidebarMenuItem = {
    action?: string;
    page?: string;
    icon?: string;
    text?: string;
    text_en?: string;
    is_header?: boolean;
    is_divider?: boolean;
    controller?: string;
    children?: SidebarMenuItem[];
    allowedUsers?: string[];
};

export const sidebarMenu: SidebarMenuItem[] = [
    {
        "text": "Menu",
        "text_en": "Menu",
        "is_header": true
    },
    {
        "controller": "Invoice-Mgmt",
        "icon": "fa-solid fa-file-invoice-dollar",
        "text": "Invoice Management",
        "text_en": "Invoice Management",
        "children": [
            {
                "action": "InvoiceChair",
                "page": "/Invoice/Chair/",
                "icon": "fa-solid fa-file-invoice",
                "text": "Invoice - Chair",
                "text_en": "Invoice - Chair"
            },
            {
                "action": "InvoiceChairWF",
                "page": "/Invoice/ChairWF/",
                "icon": "fa-solid fa-file-invoice",
                "text": "Invoice - Chair WF",
                "text_en": "Invoice - Chair WF"
            },
            {
                "action": "InvoiceMattress",
                "page": "/Invoice/Mattress/",
                "icon": "fa-solid fa-file-invoice",
                "text": "Invoice - Mattress",
                "text_en": "Invoice - Mattress"
            },
            {
                "action": "InvoiceTYJ",
                "page": "/Invoice/TYJ/",
                "icon": "fa-solid fa-file-invoice",
                "text": "Invoice - TYJ",
                "text_en": "Invoice - TYJ"
            }
        ]
    },
    // {
    //     "action": "UserMng",
    //     "page": "/StddMng/User/UserMng/",
    //     "icon": "fa fa-user",
    //     "text": "사용자 관리",
    //     "text_en": "User Management"
    // },
    {
        "is_divider": true
    },
    // {
    //     "controller": "Settings",
    //     "icon": "fa-solid fa-gear",
    //     "text": "설정",
    //     "text_en": "Settings",
    //     "children": [
    //         {
    //             "action": "WarehouseMng",
    //             "page": "/Settings/Warehouse/",
    //             "icon": "fa-solid fa-warehouse",
    //             "text": "창고 관리",
    //             "text_en": "Warehouse Management"
    //         },
    //         {
    //             "action": "EnterpriseMng",
    //             "page": "/Settings/Enterprise/",
    //             "icon": "fa-solid fa-building",
    //             "text": "기업 관리",
    //             "text_en": "Enterprise Management"
    //         },
    //         {
    //             "action": "CommonCodeMng",
    //             "page": "/Settings/CommonCode/",
    //             "icon": "fa-solid fa-tags",
    //             "text": "공통 코드 관리",
    //             "text_en": "Common Code Management"
    //         }
    //     ]
    // },
];

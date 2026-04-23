import * as vscode from 'vscode';

export async function showConfirmation(message: string, detail?: string): Promise<boolean> {
    const result = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail },
        'Confirm'
    );
    return result === 'Confirm';
}

export async function showDestructiveConfirmation(
    message: string,
    checklistItems: string[]
): Promise<boolean> {
    const items = checklistItems.map(item => ({ label: item, picked: false }));
    const result = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Check all items to confirm',
        title: message
    });

    if (!result) {
        return false;
    }

    return result.length === items.length;
}

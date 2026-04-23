import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('Git Commander');

export function log(message: string): void {
    outputChannel.appendLine(`[INFO] ${message}`);
}

export function logError(message: string, error?: unknown): void {
    outputChannel.appendLine(`[ERROR] ${message}`);
    if (error instanceof Error) {
        outputChannel.appendLine(error.stack || error.message);
    } else if (error !== undefined) {
        outputChannel.appendLine(String(error));
    }
}

export function showError(message: string, error?: unknown): void {
    logError(message, error);
    vscode.window.showErrorMessage(message);
}

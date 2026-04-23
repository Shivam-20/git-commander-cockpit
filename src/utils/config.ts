import * as vscode from 'vscode';

export function getConfig<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration('gitCommander');
    return config.get<T>(key, defaultValue);
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { NullLogService } from 'vs/platform/log/common/log';
import { MainThreadWebviewManager } from 'vs/workbench/api/browser/mainThreadWebviewManager';
import { IExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { NullApiDeprecationService } from 'vs/workbench/api/common/extHostApiDeprecationService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ExtHostWebviews } from 'vs/workbench/api/common/extHostWebview';
import { ExtHostWebviewPanels } from 'vs/workbench/api/common/extHostWebviewPanels';
import { EditorGroupColumn } from 'vs/workbench/common/editor';
import type * as vscode from 'vscode';
import { SingleProxyRPCProtocol } from './testRPCProtocol';

suite('ExtHostWebview', () => {

	let rpcProtocol: (IExtHostRpcService & IExtHostContext) | undefined;

	setup(() => {
		const shape = createNoopMainThreadWebviews();
		rpcProtocol = SingleProxyRPCProtocol(shape);
	});

	test('Cannot register multiple serializers for the same view type', async () => {
		const viewType = 'view.type';

		const extHostWebviews = new ExtHostWebviews(rpcProtocol!, {
			webviewCspSource: '',
			webviewResourceRoot: '',
			isExtensionDevelopmentDebug: false,
			remote: { authority: undefined },
		}, undefined, new NullLogService(), NullApiDeprecationService);

		const extHostWebviewPanels = new ExtHostWebviewPanels(rpcProtocol!, extHostWebviews, undefined);

		let lastInvokedDeserializer: vscode.WebviewPanelSerializer | undefined = undefined;

		class NoopSerializer implements vscode.WebviewPanelSerializer {
			async deserializeWebviewPanel(_webview: vscode.WebviewPanel, _state: any): Promise<void> {
				lastInvokedDeserializer = this;
			}
		}

		const extension = {} as IExtensionDescription;

		const serializerA = new NoopSerializer();
		const serializerB = new NoopSerializer();

		const serializerARegistration = extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerA);

		await extHostWebviewPanels.$deserializeWebviewPanel('x', viewType, {
			title: 'title',
			state: {},
			panelOptions: {},
			webviewOptions: {}
		}, 0 as EditorGroupColumn);
		assert.strictEqual(lastInvokedDeserializer, serializerA);

		assert.throws(
			() => extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerB),
			'Should throw when registering two serializers for the same view');

		serializerARegistration.dispose();

		extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerB);

		await extHostWebviewPanels.$deserializeWebviewPanel('x', viewType, {
			title: 'title',
			state: {},
			panelOptions: {},
			webviewOptions: {}
		}, 0 as EditorGroupColumn);
		assert.strictEqual(lastInvokedDeserializer, serializerB);
	});

	test('asWebviewUri for web endpoint', () => {
		const extHostWebviews = new ExtHostWebviews(rpcProtocol!, {
			webviewCspSource: '',
			webviewResourceRoot: `https://{{uuid}}.webview.contoso.com/commit/{{resource}}`,
			isExtensionDevelopmentDebug: false,
			remote: {
				authority: 'remote'
			},
		}, undefined, new NullLogService(), NullApiDeprecationService);

		const extHostWebviewPanels = new ExtHostWebviewPanels(rpcProtocol!, extHostWebviews, undefined);

		const webview = extHostWebviewPanels.createWebviewPanel({} as any, 'type', 'title', 1, {});

		function stripEndpointUuid(input: string) {
			return input.replace(/^https:\/\/[^\.]+?\./, '');
		}

		assert.strictEqual(
			stripEndpointUuid(webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html')).toString()),
			'webview.contoso.com/commit/remote/file//Users/codey/file.html',
			'Unix basic'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html#frag')).toString()),
			'webview.contoso.com/commit/remote/file//Users/codey/file.html#frag',
			'Unix should preserve fragment'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.asWebviewUri(URI.parse('file:///Users/codey/f%20ile.html')).toString()),
			'webview.contoso.com/commit/remote/file//Users/codey/f%20ile.html',
			'Unix with encoding'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.asWebviewUri(URI.parse('file://localhost/Users/codey/file.html')).toString()),
			'webview.contoso.com/commit/remote/file/localhost/Users/codey/file.html',
			'Unix should preserve authority'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.asWebviewUri(URI.parse('file:///c:/codey/file.txt')).toString()),
			'webview.contoso.com/commit/remote/file//c%3A/codey/file.txt',
			'Windows C drive'
		);
	});
});


function createNoopMainThreadWebviews() {
	return new class extends mock<MainThreadWebviewManager>() {
		$createWebviewPanel() { /* noop */ }
		$registerSerializer() { /* noop */ }
		$unregisterSerializer() { /* noop */ }
	};
}


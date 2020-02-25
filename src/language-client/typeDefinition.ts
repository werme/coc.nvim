/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, ClientCapabilities, Definition, Disposable, DocumentSelector, Position, ServerCapabilities, TextDocument, TypeDefinitionOptions, TypeDefinitionRegistrationOptions, TypeDefinitionRequest } from 'vscode-languageserver-protocol'
import languages from '../languages'
import { ProviderResult, TypeDefinitionProvider } from '../provider'
import { BaseLanguageClient, TextDocumentFeature } from './client'
import * as cv from './utils/converter'

function ensure<T, K extends keyof T>(target: T, key: K): T[K] {
  if (target[key] === void 0) {
    target[key] = {} as any
  }
  return target[key]
}

export interface ProvideTypeDefinitionSignature {
  (
    this: void,
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<Definition>
}

export interface TypeDefinitionMiddleware {
  provideTypeDefinition?: (
    this: void,
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    next: ProvideTypeDefinitionSignature
  ) => ProviderResult<Definition>
}

export class TypeDefinitionFeature extends TextDocumentFeature<boolean | TypeDefinitionOptions, TypeDefinitionRegistrationOptions, TypeDefinitionProvider> {
  constructor(client: BaseLanguageClient) {
    super(client, TypeDefinitionRequest.type)
  }

  public fillClientCapabilities(capabilites: ClientCapabilities): void {
    const typeDefinitionSupport = ensure(ensure(capabilites, 'textDocument')!, 'typeDefinition')!
    typeDefinitionSupport.dynamicRegistration = true
    typeDefinitionSupport.linkSupport = true
  }

  public initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
    const [id, options] = this.getRegistration(documentSelector, capabilities.typeDefinitionProvider)
    if (!id || !options) {
      return
    }
    this.register(this.messages, { id, registerOptions: options })
  }

  protected registerLanguageProvider(options: TypeDefinitionRegistrationOptions): [Disposable, TypeDefinitionProvider] {
    const provider: TypeDefinitionProvider = {
      provideTypeDefinition: (document, position, token) => {
        const client = this._client
        const provideTypeDefinition: ProvideTypeDefinitionSignature = (document, position, token) => {
          return client.sendRequest(TypeDefinitionRequest.type, cv.asTextDocumentPositionParams(document, position), token).then(
            res => res, error => {
              client.logFailedRequest(TypeDefinitionRequest.type, error)
              return Promise.resolve(null)
            }
          )
        }
        const middleware = client.clientOptions.middleware!
        return middleware.provideTypeDefinition
          ? middleware.provideTypeDefinition(document, position, token, provideTypeDefinition)
          : provideTypeDefinition(document, position, token)
      }
    }
    return [languages.registerTypeDefinitionProvider(options.documentSelector!, provider), provider]
  }
}

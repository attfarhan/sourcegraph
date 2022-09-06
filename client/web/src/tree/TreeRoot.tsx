/* eslint jsx-a11y/no-noninteractive-tabindex: warn*/
import * as React from 'react'
import { forwardRef, useCallback, useEffect, useMemo } from 'react'

import * as H from 'history'
import { EMPTY, merge, of, Subject } from 'rxjs'
import { catchError, debounceTime, delay, mapTo, mergeMap, share, switchMap, takeUntil } from 'rxjs/operators'

import { asError, ErrorLike, isErrorLike } from '@sourcegraph/common'
import { FileDecorationsByPath } from '@sourcegraph/shared/src/api/extension/extensionHostApi'
import { fetchTreeEntries } from '@sourcegraph/shared/src/backend/repo'
import { ExtensionsControllerProps } from '@sourcegraph/shared/src/extensions/controller'
import { Scalars, TreeFields } from '@sourcegraph/shared/src/graphql-operations'
import { TelemetryProps } from '@sourcegraph/shared/src/telemetry/telemetryService'
import { ThemeProps } from '@sourcegraph/shared/src/theme'
import { AbsoluteRepo } from '@sourcegraph/shared/src/util/url'
import { LoadingSpinner, useObservable } from '@sourcegraph/wildcard'

import { getFileDecorations } from '../backend/features'
import { requestGraphQL } from '../backend/graphql'

import { ChildTreeLayer } from './ChildTreeLayer'
import { TreeRowAlert, TreeLayerTable, TreeLayerCell } from './components'
import { MAX_TREE_ENTRIES } from './constants'
import { TreeNode } from './Tree'
import { TreeRootContext } from './TreeContext'
import { SingleChildGitTree, hasSingleChild, singleChildEntriesToGitTree } from './util'

import styles from './Tree.module.scss'

const errorWidth = (width?: string): { width: string } => ({
    width: width ? `${width}px` : 'auto',
})

export interface TreeRootProps extends AbsoluteRepo, ExtensionsControllerProps, ThemeProps, TelemetryProps {
    location: H.Location
    activeNode: TreeNode
    activePath: string
    depth: number
    expandedTrees: string[]
    parent: TreeNode | null
    parentPath?: string
    index: number
    isExpanded: boolean
    selectedNode: TreeNode
    sizeKey: string
    onHover?: (filePath: string) => void
    onSelect: (node: TreeNode) => void
    onToggleExpand: (path: string, expanded: boolean, node: TreeNode) => void
    setChildNodes: (node: TreeNode, index: number) => void
    setActiveNode: (node: TreeNode) => void
    repoID: Scalars['ID']
    enableMergedFileSymbolSidebar: boolean
    initializeParentNode?: (node: TreeNode) => void
}

const LOADING = 'loading' as const
interface TreeRootState {
    treeOrError?: typeof LOADING | TreeFields | ErrorLike
    fileDecorationsByPath: FileDecorationsByPath
}

export const TreeRoot = forwardRef<HTMLElement, TreeRootProps>((props: TreeRootProps, ref) => {
    const node: TreeNode = {
        index: props.index,
        parent: props.parent,
        childNodes: [],
        path: '',
        url: '',
    }

    const rowHovers = useMemo(() => new Subject<string>(), [])

    const fetchTreeResult = useMemo(() => {
        if (!props.isExpanded) {
            return EMPTY
        }

        const treeFetch = fetchTreeEntries({
            repoName: props.repoName,
            revision: props.revision,
            commitID: props.commitID,
            filePath: props.parentPath || '',
            first: MAX_TREE_ENTRIES,
            requestGraphQL: ({ request, variables }) => requestGraphQL(request, variables),
        }).pipe(
            catchError(error => [asError(error)]),
            share()
        )

        return merge(treeFetch, of(LOADING).pipe(delay(300), takeUntil(treeFetch)))
    }, [props.repoName, props.revision, props.commitID, props.parentPath, props.isExpanded])

    const treeOrError = useObservable(fetchTreeResult)

    const fileDecorationsByPath =
        useObservable(
            useMemo(
                () =>
                    merge(
                        fetchTreeResult.pipe(mapTo({})),
                        fetchTreeResult.pipe(
                            switchMap(treeOrError =>
                                treeOrError !== 'loading' && !isErrorLike(treeOrError)
                                    ? getFileDecorations({
                                          files: treeOrError.entries,
                                          repoName: props.repoName,
                                          commitID: props.commitID,
                                          extensionsController: props.extensionsController,
                                          parentNodeUri: treeOrError.url,
                                      })
                                    : EMPTY
                            )
                        )
                    ),
                [fetchTreeResult, props.commitID, props.repoName, props.extensionsController]
            )
        ) ?? {}

    useEffect(() => {
        // Set this row as a childNode of its TreeLayer parent
        props.setChildNodes(node, node.index)
        props.initializeParentNode?.(node)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node])

    useObservable(
        useMemo(
            () =>
                rowHovers.pipe(
                    debounceTime(100),
                    mergeMap(path =>
                        fetchTreeEntries({
                            repoName: props.repoName,
                            revision: props.revision,
                            commitID: props.commitID,
                            filePath: path,
                            first: MAX_TREE_ENTRIES,
                            requestGraphQL: ({ request, variables }) => requestGraphQL(request, variables),
                        }).pipe(catchError(error => [asError(error)]))
                    )
                ),
            [props.repoName, props.revision, props.commitID, rowHovers]
        )
    )

    let singleChildTreeEntry = {} as SingleChildGitTree
    if (treeOrError && treeOrError !== LOADING && !isErrorLike(treeOrError) && hasSingleChild(treeOrError.entries)) {
        singleChildTreeEntry = singleChildEntriesToGitTree(treeOrError.entries)
    }

    /**
     * Prefetches the children of hovered tree rows. Gets passed from the root tree layer to child tree layers
     * through the onHover prop. This method only gets called on the root tree layer component so we can debounce
     * the hover prefetch requests.
     */
    const fetchChildContents = useCallback(
        (path: string): void => {
            rowHovers.next(path)
        },
        [rowHovers]
    )

    const setChildNode = useCallback(
        (childNode: TreeNode, index: number): void => {
            console.log('SET CHILD NODE', childNode)
            node.childNodes[index] = childNode
        },
        [node]
    )

    return (
        <>
            {isErrorLike(treeOrError) ? (
                <TreeRowAlert
                    // needed because of dynamic styling
                    style={errorWidth(localStorage.getItem(props.sizeKey) ? props.sizeKey : undefined)}
                    prefix="Error loading tree"
                    error={treeOrError}
                />
            ) : (
                /**
                 * TODO: Improve accessibility here.
                 * We should not be stealing focus here, we should let the user focus on the actual items listed.
                 * Issue: https://github.com/sourcegraph/sourcegraph/issues/19167
                 */
                <TreeLayerTable tabIndex={0}>
                    <tbody>
                        <tr>
                            <TreeLayerCell>
                                {treeOrError === LOADING ? (
                                    <div className={styles.treeLoadingSpinner}>
                                        <LoadingSpinner className="tree-page__entries-loader mr-2" />
                                        Loading tree
                                    </div>
                                ) : (
                                    treeOrError && (
                                        <TreeRootContext.Provider
                                            value={{
                                                rootTreeUrl: treeOrError.url,
                                                repoID: props.repoID,
                                                repoName: props.repoName,
                                                revision: props.revision,
                                                commitID: props.commitID,
                                            }}
                                        >
                                            <ChildTreeLayer
                                                {...props}
                                                parent={node}
                                                depth={-1 as number}
                                                entries={treeOrError.entries}
                                                singleChildTreeEntry={singleChildTreeEntry}
                                                childrenEntries={singleChildTreeEntry.children}
                                                onHover={fetchChildContents}
                                                setChildNodes={setChildNode}
                                                fileDecorationsByPath={fileDecorationsByPath}
                                                enableMergedFileSymbolSidebar={props.enableMergedFileSymbolSidebar}
                                            />
                                        </TreeRootContext.Provider>
                                    )
                                )}
                            </TreeLayerCell>
                        </tr>
                    </tbody>
                </TreeLayerTable>
            )}
        </>
    )
})

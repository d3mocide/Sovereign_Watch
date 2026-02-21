import type { CSSProperties } from 'react';

export interface MapAdapterProps {
    viewState: Record<string, number>;
    onMove: (evt: any) => void;
    onLoad: (evt: any) => void;
    mapStyle: string;
    style: CSSProperties;
    onContextMenu: (evt: any) => void;
    onClick: () => void;
    deckProps: {
        id: string;
        interleaved: boolean;
        onOverlayLoaded: (overlay: any) => void;
    };
}

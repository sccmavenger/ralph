/**
 * Game data document generator library.
 * Converts raw MSF API responses into natural-language KB documents
 * so that structured game data becomes searchable knowledge.
 */
export interface CharacterData {
    id: string;
    name: string;
    traits: string[];
    abilities: Array<{
        name: string;
        description: string;
    }>;
    teams: string[];
}
export interface TeamData {
    characters: string[];
    totalBattles: number;
    wins: number;
    winRate: number;
    rank: number;
}
export interface DDData {
    id: string;
    name: string;
}
export interface NodeData {
    id: string;
    nodeNumber: number;
    section: string;
    requiredTraits: string[];
    enemies: Array<{
        name: string;
        power?: number;
    }>;
}
export interface ISO8Data {
    topClass: string;
    topClassPercent: number;
    runnerUps: Array<{
        className: string;
        percent: number;
    }>;
}
export interface GearItem {
    name: string;
    quantity: number;
    farmable: boolean;
}
export interface KBDocument {
    id: string;
    content: string;
    category: string;
    sourceCreatorName: string;
    sourceVideoTitle: string;
    sourceUrl: string;
    sourceDate: string;
    sourceTier: number;
    sourceType: string;
}
export declare function generateCharacterKitDoc(character: CharacterData): KBDocument;
export declare function generateTeamMetaDoc(team: TeamData, mode: string): KBDocument;
export declare function generateDDNodeDoc(dd: DDData, node: NodeData): KBDocument;
export declare function generateISO8Doc(character: string, isoData: ISO8Data): KBDocument;
export declare function generateGearDoc(character: string, fromTier: number, toTier: number, items: GearItem[]): KBDocument;
//# sourceMappingURL=kbGameData.d.ts.map
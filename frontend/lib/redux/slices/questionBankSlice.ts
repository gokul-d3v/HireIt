import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DiffNode {
  difficulty: string;
  count: number;
  audio_url?: string;
}

export interface SubNode {
  name: string;
  difficulties: DiffNode[];
  audio_url?: string;
  showAudioUpload?: boolean;
  expanded?: boolean;
}

export interface CategoryNode {
  name: string;
  hasSubCategories: boolean;
  subGroups: SubNode[];
  difficulties: DiffNode[]; // Matches SubNode.difficulties
  audio_url?: string;
  showAudioUpload?: boolean;
  expanded?: boolean;
}

export interface ActiveSlot {
  category: string;
  sub_category: string;
  difficulty: string;
}

interface QuestionBankState {
  tree: CategoryNode[];
  active: ActiveSlot | null;
}

const initialState: QuestionBankState = {
  tree: [],
  active: null,
};

const questionBankSlice = createSlice({
  name: 'questionBank',
  initialState,
  reducers: {
    setTree: (state, action: PayloadAction<CategoryNode[]>) => {
      state.tree = action.payload;
    },
    setExpanded: (state, action: PayloadAction<{ catIdx: number; expanded: boolean }>) => {
      if (state.tree[action.payload.catIdx]) {
        state.tree[action.payload.catIdx].expanded = action.payload.expanded;
      }
    },
    setSubExpanded: (state, action: PayloadAction<{ catIdx: number; subIdx: number; expanded: boolean }>) => {
      const { catIdx, subIdx, expanded } = action.payload;
      const category = state.tree[catIdx];
      const subGroup = category?.subGroups[subIdx];
      if (!subGroup) return;

      subGroup.expanded = expanded;
    },
    setActiveSlot: (state, action: PayloadAction<ActiveSlot | null>) => {
      state.active = action.payload;
    },
    removeDifficulty: (state, action: PayloadAction<{ catIdx: number; subIdx: number; diffIdx: number }>) => {
      const { catIdx, subIdx, diffIdx } = action.payload;
      const cat = state.tree[catIdx];
      if (!cat) return;
      const sub = cat.subGroups[subIdx];
      if (!sub) return;
      const diff = sub.difficulties[diffIdx];
      if (!diff) return;

      if (
        state.active?.category === cat.name &&
        state.active?.sub_category === sub.name &&
        state.active?.difficulty === diff.difficulty
      ) {
        state.active = null;
      }

      sub.difficulties.splice(diffIdx, 1);
    },
    removeCategory: (state, action: PayloadAction<number>) => {
      const catIdx = action.payload;
      const cat = state.tree[catIdx];
      if (!cat) return;

      if (state.active?.category === cat.name) {
        state.active = null;
      }

      state.tree.splice(catIdx, 1);
    },
    renameCategory: (state, action: PayloadAction<{ catIdx: number; newName: string }>) => {
        const { catIdx, newName } = action.payload;
        const category = state.tree[catIdx];
        if (!category) return;

        const oldName = category.name;
        category.name = newName;

        if (state.active?.category === oldName) {
            state.active.category = newName;
        }
    },
    toggleHasSub: (state, action: PayloadAction<{ catIdx: number; has: boolean }>) => {
        const { catIdx, has } = action.payload;
        const c = state.tree[catIdx];
        if (!c) return;
        
        c.hasSubCategories = has;
        if (!has) {
            // Flattening: merge all difficulties from all sub-groups into root
            const mergedDiffs: Record<string, { count: number, audio_url?: string }> = {};
            c.subGroups.forEach(sub => {
                sub.difficulties.forEach(d => {
                    if (!mergedDiffs[d.difficulty]) {
                        mergedDiffs[d.difficulty] = { count: 0, audio_url: d.audio_url };
                    }
                    mergedDiffs[d.difficulty].count += d.count;
                    // If multiple sub-cats have audio for same diff, last one wins or we prefer the first.
                    // Simplified: keep whatever was there.
                });
            });
            c.subGroups = [{
                name: "",
                expanded: true,
                difficulties: Object.entries(mergedDiffs).map(([difficulty, data]) => ({ 
                    difficulty, 
                    count: data.count,
                    audio_url: data.audio_url
                }))
            }];

            if (state.active?.category === c.name) {
                state.active.sub_category = "";
            }
        }
    },
    addSubCategory: (state, action: PayloadAction<{ catIdx: number; subName: string }>) => {
        const { catIdx, subName } = action.payload;
        const c = state.tree[catIdx];
        if (!c) return;
        c.subGroups.push({ name: subName.trim(), difficulties: [], expanded: true });
    },
    renameSubCategory: (state, action: PayloadAction<{ catIdx: number; subIdx: number; newName: string }>) => {
        const { catIdx, subIdx, newName } = action.payload;
        const c = state.tree[catIdx];
        if (!c) return;
        const sub = c.subGroups[subIdx];
        if (!sub) return;
        const oldName = sub.name;
        sub.name = newName;

        if (state.active?.category === c.name && state.active?.sub_category === oldName) {
            state.active.sub_category = newName;
        }
    },
    removeSubCategory: (state, action: PayloadAction<{ catIdx: number; subIdx: number }>) => {
        const { catIdx, subIdx } = action.payload;
        const c = state.tree[catIdx];
        if (!c) return;
        const sub = c.subGroups[subIdx];
        if (!sub) return;

        if (state.active?.category === c.name && state.active?.sub_category === sub.name) {
            state.active = null;
        }
        c.subGroups.splice(subIdx, 1);
    },
    addDifficulty: (state, action: PayloadAction<{ catIdx: number; subIdx: number; diff: string }>) => {
        const { catIdx, subIdx, diff } = action.payload;
        const c = state.tree[catIdx];
        if (!c) return;
        const sg = c.subGroups[subIdx];
        if (!sg) return;
        
        const existing = sg.difficulties.find(d => d.difficulty === diff.trim());
        if (!existing) {
            sg.difficulties.push({ difficulty: diff.trim(), count: 0 });
        }
    },
    setAudio: (state, action: PayloadAction<{ catIdx: number; subIdx?: number; diffIdx?: number; url: string }>) => {
        const { catIdx, subIdx, diffIdx, url } = action.payload;
        const c = state.tree[catIdx];
        if (!c) return;
        
        if (subIdx !== undefined && c.subGroups[subIdx]) {
            const sub = c.subGroups[subIdx];
            if (diffIdx !== undefined && sub.difficulties[diffIdx]) {
                sub.difficulties[diffIdx].audio_url = url;
            } else {
                sub.audio_url = url;
            }
        } else {
            if (diffIdx !== undefined && c.subGroups[0]?.difficulties[diffIdx]) {
                c.subGroups[0].difficulties[diffIdx].audio_url = url;
            } else {
                c.audio_url = url;
            }
        }
    },
    toggleAudioUpload: (state, action: PayloadAction<{ catIdx: number; subIdx?: number }>) => {
        const { catIdx, subIdx } = action.payload;
        const cat = state.tree[catIdx];
        if (!cat) return;
        if (subIdx !== undefined && cat.subGroups[subIdx]) {
            cat.subGroups[subIdx].showAudioUpload = !cat.subGroups[subIdx].showAudioUpload;
        } else {
            cat.showAudioUpload = !cat.showAudioUpload;
        }
    }
  },
});

export const { 
    setTree, 
    setExpanded, 
    setSubExpanded,
    setActiveSlot, 
    removeDifficulty, 
    removeCategory,
    renameCategory,
    toggleHasSub,
    addSubCategory,
    renameSubCategory,
    removeSubCategory,
    addDifficulty,
    setAudio,
    toggleAudioUpload
} = questionBankSlice.actions;
export default questionBankSlice.reducer;

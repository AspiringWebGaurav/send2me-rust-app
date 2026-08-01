import { create } from 'zustand';

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  is_folder: boolean;
  added_at: number;
}

export interface DriveGuest {
  node_id: string;
  name: string;
}

export interface DriveRequest {
  id: string;
  request_type: 'Download' | 'Upload';
  guest_node_id: string;
  guest_name: string;
  file_name: string;
  file_size: number;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  sender_name: string;
  content: string;
  timestamp: number;
  is_host: boolean;
}

interface DriveState {
  isOnline: boolean;
  activeGuests: DriveGuest[];
  virtualFiles: DriveFile[];
  pendingRequests: DriveRequest[];
  chatMessages: ChatMessage[];
  
  // Actions
  setOnline: (online: boolean) => void;
  addGuest: (guest: DriveGuest) => void;
  removeGuest: (node_id: string) => void;
  addVirtualFile: (file: DriveFile) => void;
  removeVirtualFile: (file_id: string) => void;
  addRequest: (req: DriveRequest) => void;
  removeRequest: (request_id: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearState: () => void;
}

export const useDriveStore = create<DriveState>((set) => ({
  isOnline: false,
  activeGuests: [],
  virtualFiles: [],
  pendingRequests: [],
  chatMessages: [],

  setOnline: (online) => set({ isOnline: online }),
  
  addGuest: (guest) => 
    set((state) => ({ 
      activeGuests: [...state.activeGuests.filter(g => g.node_id !== guest.node_id), guest] 
    })),
    
  removeGuest: (node_id) => 
    set((state) => ({ 
      activeGuests: state.activeGuests.filter(g => g.node_id !== node_id) 
    })),
    
  addVirtualFile: (file) => 
    set((state) => ({ 
      virtualFiles: [...state.virtualFiles, file] 
    })),
    
  removeVirtualFile: (file_id) => 
    set((state) => ({ 
      virtualFiles: state.virtualFiles.filter(f => f.id !== file_id) 
    })),
    
  addRequest: (req) => 
    set((state) => ({ 
      pendingRequests: [...state.pendingRequests, req] 
    })),
    
  removeRequest: (request_id) => 
    set((state) => ({ 
      pendingRequests: state.pendingRequests.filter(r => r.id !== request_id) 
    })),
    
  addChatMessage: (msg) => 
    set((state) => ({ 
      chatMessages: [...state.chatMessages, msg] 
    })),
    
  clearState: () => set({
    isOnline: false,
    activeGuests: [],
    virtualFiles: [],
    pendingRequests: [],
    chatMessages: []
  })
}));

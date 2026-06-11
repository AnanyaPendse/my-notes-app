import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  BookHeart,
  ImagePlus,
  LogOut,
  Plus,
  Search,
  Trash2,
  X,
  Check,
  Save,
  Leaf,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Your notes — Paper" },
      { name: "description", content: "Your warm little notebook." },
    ],
  }),
  component: NotesPage,
});

type Note = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  image_paths: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const NOTES_KEY = ["notes"] as const;
const TRASH_KEY = ["trash"] as const;
const TRASH_DAYS = 30;

async function fetchNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Note[];
}

async function fetchTrash(): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Note[];
}

async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from("note-images")
    .createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

function daysLeft(deletedAt: string): number {
  const ms = new Date(deletedAt).getTime() + TRASH_DAYS * 86400000 - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

function NotesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"notes" | "trash">("notes");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: NOTES_KEY,
    queryFn: fetchNotes,
  });
  const { data: trash = [], isLoading: trashLoading } = useQuery({
    queryKey: TRASH_KEY,
    queryFn: fetchTrash,
    enabled: view === "trash",
  });

  useEffect(() => {
    if (view !== "notes") return;
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes, selectedId, view]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [notes, search]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const createNote = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("notes")
        .insert({ user_id: u.user.id, title: "", content: "" })
        .select()
        .single();
      if (error) throw error;
      return data as Note;
    },
    onSuccess: (note) => {
      qc.setQueryData<Note[]>(NOTES_KEY, (prev) => [note, ...(prev ?? [])]);
      setSelectedId(note.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create note"),
  });

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Nav rail */}
      <aside className="md:w-60 md:border-r border-border bg-sidebar flex flex-col md:h-screen">
        <div className="p-5 border-b border-sidebar-border flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-accent/40 flex items-center justify-center">
              <BookHeart className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-xl leading-none text-foreground truncate">Paper</h1>
              <p className="text-xs text-muted-foreground mt-0.5">your notebook</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            title="Sign out"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-3 space-y-1.5 flex-1">
          <Button
            onClick={() => createNote.mutate()}
            disabled={createNote.isPending}
            className="w-full justify-start"
          >
            <Plus className="w-4 h-4 mr-2" />
            New note
          </Button>
          <Button
            variant={view === "notes" ? "secondary" : "ghost"}
            onClick={() => setView("notes")}
            className="w-full justify-start"
          >
            <BookHeart className="w-4 h-4 mr-2" /> All notes
          </Button>
          <Button
            variant={view === "trash" ? "secondary" : "ghost"}
            onClick={() => setView("trash")}
            className="w-full justify-start"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Trash
          </Button>
        </div>
      </aside>

      {/* Notes list column */}
      {view === "notes" && (
        <section className="md:w-72 md:border-r border-border bg-sidebar/60 flex flex-col md:h-screen">
          <div className="p-3 border-b border-sidebar-border space-y-2">
            <h2 className="font-serif text-lg text-foreground px-1">Notes</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search titles"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoading ? (
              <p className="text-sm text-muted-foreground px-3 py-6 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-6 text-center">
                {notes.length === 0 ? "No notes yet. Click 'New note'." : "No matches."}
              </p>
            ) : (
              filtered.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition border ${
                    selectedId === n.id
                      ? "bg-card border-accent/60 shadow-paper"
                      : "border-transparent hover:bg-sidebar-accent"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="font-serif text-base truncate text-foreground flex-1 min-w-0">
                      {n.title.trim() || "Untitled"}
                    </div>
                    {n.image_paths.length > 0 && (
                      <ImagePlus className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground/80 mt-1">
                    {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {/* Main */}
      <main className="flex-1 min-h-screen md:h-screen overflow-y-auto">
        {view === "trash" ? (
          <TrashView trash={trash} loading={trashLoading} />
        ) : selected ? (
          <NoteEditor key={selected.id} note={selected} />
        ) : (
          <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
            <Leaf className="w-12 h-12 text-accent mb-4" />
            <h2 className="font-serif text-2xl text-foreground">A blank page awaits.</h2>
            <p className="text-muted-foreground mt-2">Select a note, or create a new one.</p>
            <Button onClick={() => createNote.mutate()} className="mt-6">
              <Plus className="w-4 h-4 mr-2" /> New note
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}


function NoteEditor({ note }: { note: Note }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [paths, setPaths] = useState<string[]>(note.image_paths);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty =
    title !== note.title ||
    content !== note.content ||
    JSON.stringify(paths) !== JSON.stringify(note.image_paths);

  const { data: urlMap = {} } = useQuery({
    queryKey: ["note-image-urls", note.id, paths.join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .update({ title, content, image_paths: paths })
        .eq("id", note.id)
        .select()
        .single();
      if (error) throw error;
      return data as Note;
    },
    onSuccess: (updated) => {
      qc.setQueryData<Note[]>(NOTES_KEY, (prev) =>
        (prev ?? [])
          .map((n) => (n.id === updated.id ? updated : n))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      );
      toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const softDelete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", note.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.setQueryData<Note[]>(NOTES_KEY, (prev) =>
        (prev ?? []).filter((n) => n.id !== note.id),
      );
      qc.invalidateQueries({ queryKey: TRASH_KEY });
      toast.success(`Moved to trash · kept for ${TRASH_DAYS} days`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const newPaths: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${u.user.id}/${note.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("note-images")
          .upload(path, file, { contentType: file.type });
        if (error) throw error;
        newPaths.push(path);
      }
      setPaths((prev) => [...prev, ...newPaths]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeImage(path: string) {
    setPaths((prev) => prev.filter((p) => p !== path));
    await supabase.storage.from("note-images").remove([path]).catch(() => {});
  }

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 md:py-12">
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Last edited {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
          {dirty && <span className="ml-2 text-accent-foreground/70">· unsaved changes</span>}
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            <ImagePlus className="w-4 h-4 mr-1.5" />
            {uploading ? "Uploading…" : "Add image"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? (
              "Saving…"
            ) : dirty ? (
              <>
                <Save className="w-4 h-4 mr-1.5" /> Save
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" /> Saved
              </>
            )}
          </Button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled"
        className="w-full bg-transparent border-0 outline-none font-serif text-4xl md:text-5xl text-foreground placeholder:text-muted-foreground/50 mb-4"
      />

      {paths.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {paths.map((p) => (
            <div
              key={p}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted shadow-paper"
            >
              {urlMap[p] ? (
                <img
                  src={urlMap[p]}
                  alt="Note attachment"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full animate-pulse bg-muted" />
              )}
              <button
                type="button"
                onClick={() => removeImage(p)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/90 text-foreground opacity-0 group-hover:opacity-100 transition flex items-center justify-center shadow-paper"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start writing…"
        className="min-h-[60vh] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60"
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this note to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              It will stay in your trash for {TRASH_DAYS} days, then be permanently deleted.
              You can restore it any time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => softDelete.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TrashView({ trash, loading }: { trash: Note[]; loading: boolean }) {
  const qc = useQueryClient();
  const [purgeTarget, setPurgeTarget] = useState<Note | null>(null);

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notes")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.setQueryData<Note[]>(TRASH_KEY, (prev) => (prev ?? []).filter((n) => n.id !== id));
      qc.invalidateQueries({ queryKey: NOTES_KEY });
      toast.success("Note restored");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Restore failed"),
  });

  const purge = useMutation({
    mutationFn: async (note: Note) => {
      if (note.image_paths.length > 0) {
        await supabase.storage.from("note-images").remove(note.image_paths);
      }
      const { error } = await supabase.from("notes").delete().eq("id", note.id);
      if (error) throw error;
    },
    onSuccess: (_d, note) => {
      qc.setQueryData<Note[]>(TRASH_KEY, (prev) => (prev ?? []).filter((n) => n.id !== note.id));
      toast.success("Note permanently deleted");
      setPurgeTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-8 md:py-12">
      <div className="flex items-center gap-3 mb-2">
        <Trash2 className="w-6 h-6 text-primary" />
        <h2 className="font-serif text-3xl text-foreground">Trash</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Notes here are kept for {TRASH_DAYS} days, then permanently removed.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : trash.length === 0 ? (
        <div className="text-center py-20">
          <Leaf className="w-10 h-10 text-accent mx-auto mb-3" />
          <p className="text-muted-foreground">Your trash is empty.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {trash.map((n) => {
            const left = n.deleted_at ? daysLeft(n.deleted_at) : 0;
            return (
              <li
                key={n.id}
                className="paper-card p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-lg truncate text-foreground">
                    {n.title.trim() || "Untitled"}
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {n.content.trim() || "Empty note"}
                  </div>
                  <div className="text-xs text-muted-foreground/80 mt-2">
                    Deleted {n.deleted_at && formatDistanceToNow(new Date(n.deleted_at), { addSuffix: true })}
                    {" · "}
                    <span className={left <= 3 ? "text-destructive" : ""}>
                      {left} day{left === 1 ? "" : "s"} left
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restore.mutate(n.id)}
                    disabled={restore.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPurgeTarget(n)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete forever
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!purgeTarget} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The note and any attached images will be removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => purgeTarget && purge.mutate(purgeTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

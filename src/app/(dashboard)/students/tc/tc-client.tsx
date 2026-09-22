"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle, AlertTriangle, FileText, Printer, ArrowLeft, RotateCcw, XCircle } from "lucide-react";
import { listStudentsAction } from "@/server/actions/student.actions";
import {
  listTCsAction,
  generateTCAction,
  updateTCAction,
  executeTCStatusActionAction,
  getTCDetailAction,
} from "@/server/actions/tc.actions";
import { TransferCertificateDocument } from "@/components/tc/transfer-certificate-document";
import { printTC } from "@/components/tc/tc-printer";

// ─── Component Types ─────────────────────────────────────────────────────────

type Session = {
  id: string;
  name: string;
  isCurrent: boolean;
};

type Section = {
  id: string;
  name: string;
};

type Class = {
  id: string;
  name: string;
  sections: Section[];
};

type StudentRow = {
  id: string;
  fullName: string;
  admissionNo: string;
  gender: string | null;
  dateOfBirth: Date | null;
  status: string;
  family: {
    fatherName: string | null;
    motherName: string | null;
    primaryPhone: string | null;
  } | null;
};

type TCDetail = {
  id: string;
  tcNumber: string;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  studentId: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  snapshot: string;
  dateOfIssue: Date;
  attendance: string | null;
  conduct: string | null;
  remarks: string | null;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function TCClient({
  sessions,
  classes,
}: {
  sessions: Session[];
  classes: Class[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"generate" | "register">("generate");

  // ─── Filter States (Generate Tab) ──────────────────────────────────────────
  const [selectedSessionId, setSelectedSessionId] = useState(sessions.find(s => s.isCurrent)?.id || sessions[0]?.id || "");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Student list
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  // Active TC for selected student
  const [activeTC, setActiveTC] = useState<TCDetail | null>(null);
  const [loadingTC, setLoadingTC] = useState(false);

  // Form states for Draft TC
  const [tcForm, setTcForm] = useState({
    attendance: "",
    conduct: "Good",
    remarks: "Passed and promoted",
    dateOfIssue: new Date().toISOString().split("T")[0],
  });

  // ─── Register States ────────────────────────────────────────────────────────
  const [regSessionId, setRegSessionId] = useState("");
  const [regClassId, setRegClassId] = useState("");
  const [regSectionId, setRegSectionId] = useState("");
  const [regSearch, setRegSearch] = useState("");
  const [regStatus, setRegStatus] = useState("");
  const [tcList, setTcList] = useState<any[]>([]);
  const [regTotal, setRegTotal] = useState(0);
  const [regPage, setRegPage] = useState(1);
  const [regPageSize] = useState(10);
  const [loadingRegister, setLoadingRegister] = useState(false);

  // ─── Print/Preview Target ──────────────────────────────────────────────────
  const [previewTC, setPreviewTC] = useState<any | null>(null);

  // Resolve active section dropdown items based on Class
  const activeSections = useMemo(() => {
    const cls = classes.find(c => c.id === (activeTab === "generate" ? selectedClassId : regClassId));
    return cls ? cls.sections : [];
  }, [classes, selectedClassId, regClassId, activeTab]);

  // Load students for Selection list
  const fetchStudentList = async () => {
    setLoadingStudents(true);
    try {
      const res = await listStudentsAction({
        sessionId: selectedSessionId || undefined,
        classId: selectedClassId || undefined,
        sectionId: selectedSectionId || undefined,
        search: searchQuery.trim() || undefined,
        status: "ACTIVE",
        page: 1,
        pageSize: 200,
      });
      setStudents(res.items as any);
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoadingStudents(false);
    }
  };

  // Load TC for selected student
  const loadStudentTC = async (studentId: string) => {
    setLoadingTC(true);
    try {
      const res = await listTCsAction({
        search: studentId,
        page: 1,
        pageSize: 1,
      });
      if (res.items && res.items.length > 0) {
        // Retrieve full detail snapshot
        const fullDetail = await getTCDetailAction(res.items[0].id);
        setActiveTC(fullDetail as any);
        setTcForm({
          attendance: fullDetail.attendance || "",
          conduct: fullDetail.conduct || "Good",
          remarks: fullDetail.remarks || "",
          dateOfIssue: new Date(fullDetail.dateOfIssue).toISOString().split("T")[0],
        });
      } else {
        setActiveTC(null);
        setTcForm({
          attendance: "",
          conduct: "Good",
          remarks: "Passed and promoted",
          dateOfIssue: new Date().toISOString().split("T")[0],
        });
      }
    } catch {
      toast.error("Failed to check existing Transfer Certificates");
    } finally {
      setLoadingTC(false);
    }
  };

  // Fetch register list
  const fetchRegisterList = async () => {
    setLoadingRegister(true);
    try {
      const res = await listTCsAction({
        sessionId: regSessionId || undefined,
        classId: regClassId || undefined,
        sectionId: regSectionId || undefined,
        status: regStatus ? (regStatus as any) : undefined,
        search: regSearch.trim() || undefined,
        page: regPage,
        pageSize: regPageSize,
      });
      setTcList(res.items);
      setRegTotal(res.total);
    } catch {
      toast.error("Failed to load TC Register");
    } finally {
      setLoadingRegister(false);
    }
  };

  // Trigger loading list when filters change
  useEffect(() => {
    if (activeTab === "generate") {
      fetchStudentList();
    }
  }, [selectedSessionId, selectedClassId, selectedSectionId, searchQuery, activeTab]);

  useEffect(() => {
    if (activeTab === "register") {
      fetchRegisterList();
    }
  }, [regSessionId, regClassId, regSectionId, regSearch, regStatus, regPage, activeTab]);

  // Handle student select click
  const selectStudent = (student: StudentRow) => {
    setSelectedStudent(student);
    loadStudentTC(student.id);
  };

  // Create Draft TC
  const handleCreateDraft = () => {
    if (!selectedStudent) return;
    startTransition(async () => {
      try {
        await generateTCAction({
          studentId: selectedStudent.id,
          sessionId: selectedSessionId,
          classId: selectedClassId,
          sectionId: selectedSectionId,
          attendance: tcForm.attendance,
          conduct: tcForm.conduct,
          remarks: tcForm.remarks,
          dateOfIssue: new Date(tcForm.dateOfIssue),
        });
        toast.success("Draft Transfer Certificate created successfully");
        loadStudentTC(selectedStudent.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to generate TC draft");
      }
    });
  };

  // Save changes to Draft TC
  const handleSaveDraftChanges = () => {
    if (!activeTC) return;
    startTransition(async () => {
      try {
        await updateTCAction({
          tcId: activeTC.id,
          attendance: tcForm.attendance,
          conduct: tcForm.conduct,
          remarks: tcForm.remarks,
          dateOfIssue: new Date(tcForm.dateOfIssue),
        });
        toast.success("Changes saved to draft");
        loadStudentTC(activeTC.studentId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save changes");
      }
    });
  };

  // Execute status change actions (Issue, Revert, Cancel)
  const handleStatusAction = (action: "issue" | "undoIssue" | "cancel") => {
    const targetId = activeTC?.id || previewTC?.id;
    if (!targetId) return;

    let confirmMsg = "";
    if (action === "issue") confirmMsg = "Are you sure you want to issue this Transfer Certificate? Once issued, it will lock and mark the student's status as Transferred.";
    if (action === "undoIssue") confirmMsg = "Are you sure you want to undo this issued TC? This will revert it to draft status and restore the student profile.";
    if (action === "cancel") confirmMsg = "Are you sure you want to cancel this TC? Cancelled TCs cannot be updated or issued, and remain as a locked historical log.";

    if (!confirm(confirmMsg)) return;

    startTransition(async () => {
      try {
        await executeTCStatusActionAction({ tcId: targetId, action });
        toast.success(`Action "${action}" executed successfully`);
        
        // Refresh local views
        if (selectedStudent) {
          loadStudentTC(selectedStudent.id);
        }
        if (previewTC) {
          const updated = await getTCDetailAction(previewTC.id);
          setPreviewTC(updated);
        }
        fetchRegisterList();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  };

  // Open printed preview view
  const triggerPrintPreview = async (tc: any) => {
    try {
      const details = await getTCDetailAction(tc.id);
      setPreviewTC(details);
    } catch {
      toast.error("Failed to load certificate preview details");
    }
  };

  // Parse serialized snapshot from TC detail
  const resolvedSnapshot = useMemo(() => {
    if (!previewTC?.snapshot) return null;
    try {
      return JSON.parse(previewTC.snapshot);
    } catch {
      return null;
    }
  }, [previewTC]);

  // QR Code generator URL
  const qrCodeUrl = useMemo(() => {
    if (!previewTC) return "";
    const payload = `TC No: ${previewTC.tcNumber}\nStudent ID: ${previewTC.studentId}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(payload)}`;
  }, [previewTC]);

  return (
    <div className="space-y-6">
      {previewTC && resolvedSnapshot && (
        <div className="fixed inset-0 z-[9999] bg-white text-stone-900 p-0 hidden print:block print-preview-area overflow-auto">
          <TransferCertificateDocument tc={previewTC} snapshot={resolvedSnapshot} isPrintOnly={true} />
        </div>
      )}

      {/* ── SCREEN INTERFACE (Hidden during printing) ── */}
      <div className="print:hidden space-y-6">
        
        {/* Tab switcher */}
        <div className="flex gap-1.5 rounded-xl border bg-stone-50 p-1">
          <button
            onClick={() => { setActiveTab("generate"); setPreviewTC(null); }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "generate" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Generate Transfer Certificate
          </button>
          <button
            onClick={() => { setActiveTab("register"); setPreviewTC(null); }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "register" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            TC Register
          </button>
        </div>

        {/* ── PREVIEW BANNER & LIVE PREVIEW ────────────────────────────── */}
        {previewTC && resolvedSnapshot && (
          <div className="space-y-6">
            <Card className="border-indigo-200 bg-indigo-50/20">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-indigo-900 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Transfer Certificate Preview ({previewTC.tcNumber})
                  </CardTitle>
                  <p className="text-xs text-indigo-700 mt-1">
                    Status: <strong className="uppercase">{previewTC.status}</strong> | Student: {resolvedSnapshot.student?.fullName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => printTC(previewTC, resolvedSnapshot)}
                    className="bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> Print / Save PDF
                  </Button>
                  {previewTC.status === "DRAFT" && (
                    <Button size="sm" onClick={() => handleStatusAction("issue")} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                      Issue Certificate
                    </Button>
                  )}
                  {previewTC.status === "ISSUED" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleStatusAction("undoIssue")} disabled={pending} className="text-stone-600 flex items-center gap-1">
                        <RotateCcw className="h-3.5 w-3.5" /> Undo Issue
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleStatusAction("cancel")} disabled={pending} className="flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" /> Cancel TC
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPreviewTC(null)} className="flex items-center gap-1 text-stone-600">
                    <ArrowLeft className="h-4 w-4" /> Exit Preview
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* On-screen Certificate Preview Layout */}
            <div className="border border-stone-200 rounded-xl bg-stone-200/50 p-4 sm:p-8 flex justify-center items-center overflow-x-auto print-preview-area">
              <div className="w-full max-w-[200mm] bg-white shadow-2xl rounded-sm border border-stone-300">
                <TransferCertificateDocument tc={previewTC} snapshot={resolvedSnapshot} />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: GENERATE CERTIFICATE ─────────────────────────────────── */}
        {activeTab === "generate" && !previewTC && (
          <div className="grid gap-6 md:grid-cols-3">
            
            {/* Sidebar selection list */}
            <div className="space-y-4 md:col-span-1">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase font-black text-stone-500 tracking-wider">Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Session</Label>
                    <Select value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)}>
                      {sessions.map(s => <option key={s.id} value={s.id}>{s.name} {s.isCurrent ? "(Current)" : ""}</option>)}
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Class</Label>
                      <Select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                        <option value="">All Classes</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Section</Label>
                      <Select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)} disabled={!selectedClassId}>
                        <option value="">All</option>
                        {activeSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </Select>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                    <Input
                      placeholder="Search student..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Student list card */}
              <Card className="max-h-[500px] overflow-y-auto">
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-xs font-bold text-stone-500 uppercase">Student List ({students.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-stone-100">
                    {loadingStudents ? (
                      <div className="p-6 text-center text-stone-400 flex items-center justify-center gap-2 text-xs">
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-650" /> Loading...
                      </div>
                    ) : students.length === 0 ? (
                      <p className="p-6 text-center text-stone-400 text-xs font-medium">No active students found matching filters.</p>
                    ) : (
                      students.map(s => (
                        <button
                          key={s.id}
                          onClick={() => selectStudent(s)}
                          className={`w-full text-left p-3 hover:bg-stone-50/50 transition flex flex-col gap-0.5 ${
                            selectedStudent?.id === s.id ? "bg-indigo-50/50 border-l-4 border-indigo-600" : ""
                          }`}
                        >
                          <p className="font-semibold text-stone-900 text-xs">{s.fullName}</p>
                          <div className="flex items-center justify-between text-[10px] text-stone-500">
                            <span>Adm: {s.admissionNo}</span>
                            <span>{s.family?.fatherName || "—"}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* TC Creation Form & Details display */}
            <div className="md:col-span-2 space-y-4">
              {selectedStudent ? (
                <Card>
                  <CardHeader className="border-b flex flex-row items-center justify-between pb-3">
                    <div>
                      <CardTitle className="text-base font-bold text-stone-900">{selectedStudent.fullName}</CardTitle>
                      <p className="text-xs text-stone-500 mt-1">Admission No: {selectedStudent.admissionNo}</p>
                    </div>
                    {activeTC && (
                      <Badge variant={activeTC.status === "ISSUED" ? "success" : activeTC.status === "CANCELLED" ? "destructive" : "secondary"}>
                        {activeTC.status}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="pt-4">
                    {loadingTC ? (
                      <div className="py-12 flex justify-center items-center text-stone-400 text-xs">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Checking TC history...
                      </div>
                    ) : (
                      <div className="space-y-6">
                        
                        {/* Display existing TC details and print options if already created */}
                        {activeTC && (
                          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/30 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-stone-700">TC Record Exists</p>
                                <p className="text-[11px] text-stone-500 mt-0.5 font-mono">No: {activeTC.tcNumber}</p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => triggerPrintPreview(activeTC)}
                                className="bg-stone-900 text-white hover:bg-stone-800 flex items-center gap-1.5"
                              >
                                <FileText className="h-4 w-4" /> View / Reprint
                              </Button>
                            </div>
                            {activeTC.status !== "DRAFT" && (
                              <p className="text-[11px] text-stone-400 italic">
                                This Transfer Certificate has been officially issued. Legal fields are locked from further editing.
                              </p>
                            )}
                          </div>
                        )}

                        {/* Editable Form for draft generation */}
                        {(!activeTC || activeTC.status === "DRAFT") && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider">
                              {activeTC ? "Edit Draft Certificate Information" : "Certificate Variables (Non-derived fields)"}
                            </h4>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label htmlFor="attendance">Total Attendance / Days Present</Label>
                                <Input
                                  id="attendance"
                                  placeholder="e.g. 185 days out of 210"
                                  value={tcForm.attendance}
                                  onChange={(e) => setTcForm(f => ({ ...f, attendance: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="conduct">General Conduct</Label>
                                <Select
                                  id="conduct"
                                  value={tcForm.conduct}
                                  onChange={(e) => setTcForm(f => ({ ...f, conduct: e.target.value }))}
                                >
                                  <option value="Good">Good</option>
                                  <option value="Very Good">Very Good</option>
                                  <option value="Excellent">Excellent</option>
                                  <option value="Satisfactory">Satisfactory</option>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="remarks">Remarks / Reason for Leaving</Label>
                                <Input
                                  id="remarks"
                                  placeholder="e.g. Personal Reason / Parents transferred"
                                  value={tcForm.remarks}
                                  onChange={(e) => setTcForm(f => ({ ...f, remarks: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="dateOfIssue">Date of Issue</Label>
                                <Input
                                  id="dateOfIssue"
                                  type="date"
                                  value={tcForm.dateOfIssue}
                                  onChange={(e) => setTcForm(f => ({ ...f, dateOfIssue: e.target.value }))}
                                />
                              </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-2 border-t text-xs">
                              {activeTC ? (
                                <>
                                  <Button onClick={handleSaveDraftChanges} disabled={pending} className="bg-stone-900 text-white">
                                    {pending ? "Saving..." : "Save Draft Changes"}
                                  </Button>
                                  <Button onClick={() => handleStatusAction("issue")} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                    Issue Certificate
                                  </Button>
                                </>
                              ) : (
                                <Button onClick={handleCreateDraft} disabled={pending} className="bg-stone-900 text-white">
                                  {pending ? "Generating..." : "Generate Draft TC"}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}

                        {activeTC && activeTC.status === "ISSUED" && (
                          <div className="flex justify-end gap-2 text-xs border-t pt-4">
                            <Button variant="outline" onClick={() => handleStatusAction("undoIssue")} disabled={pending} className="text-stone-600 flex items-center gap-1">
                              <RotateCcw className="h-3.5 w-3.5" /> Undo Issue (Unlock)
                            </Button>
                            <Button variant="destructive" onClick={() => handleStatusAction("cancel")} disabled={pending} className="flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5" /> Cancel TC Record
                            </Button>
                          </div>
                        )}

                        {activeTC && activeTC.status === "CANCELLED" && (
                          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-3">
                            <div className="flex items-start gap-2.5">
                              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-red-800">Transfer Certificate Cancelled</p>
                                <p className="text-[11px] text-red-700 mt-1">
                                  This record is locked and marked cancelled. You can now generate a fresh draft TC for this student if required.
                                </p>
                              </div>
                            </div>
                            <Button onClick={handleCreateDraft} disabled={pending} className="bg-stone-900 text-white text-xs">
                              Create New Draft TC
                            </Button>
                          </div>
                        )}

                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-2xl border border-dashed p-12 text-center text-stone-400">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-stone-300" />
                  <p className="text-sm font-semibold">No student selected</p>
                  <p className="text-xs mt-1 text-stone-400">Choose a student from the sidebar filters and list to manage or issue a Transfer Certificate.</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── TAB: TC REGISTER ───────────────────────────────────────────── */}
        {activeTab === "register" && !previewTC && (
          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <CardTitle>Transfer Certificate Register</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              
              {/* Register Filters row */}
              <div className="grid gap-3 sm:grid-cols-5 text-xs">
                <div className="space-y-1">
                  <Label>Session</Label>
                  <Select value={regSessionId} onChange={(e) => { setRegSessionId(e.target.value); setRegPage(1); }}>
                    <option value="">All Sessions</option>
                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Class</Label>
                  <Select value={regClassId} onChange={(e) => { setRegClassId(e.target.value); setRegSectionId(""); setRegPage(1); }}>
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Section</Label>
                  <Select value={regSectionId} onChange={(e) => { setRegSectionId(e.target.value); setRegPage(1); }} disabled={!regClassId}>
                    <option value="">All</option>
                    {activeSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={regStatus} onChange={(e) => { setRegStatus(e.target.value); setRegPage(1); }}>
                    <option value="">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="ISSUED">Issued</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Search Searchbox</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
                    <Input
                      placeholder="TC No, Student..."
                      value={regSearch}
                      onChange={(e) => { setRegSearch(e.target.value); setRegPage(1); }}
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Scrollable Register Table */}
              <div className="overflow-x-auto overflow-y-auto max-h-[480px] rounded-xl border bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">TC Number</th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Admission No</th>
                      <th className="p-3">Class studied</th>
                      <th className="p-3">Date of Issue</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {loadingRegister ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-stone-400 flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-650" /> Loading register data...
                        </td>
                      </tr>
                    ) : tcList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-stone-400 font-medium">No Transfer Certificates registered.</td>
                      </tr>
                    ) : (
                      tcList.map((tc) => (
                        <tr key={tc.id} className="hover:bg-stone-50/30">
                          <td className="p-3 font-mono font-bold text-stone-600">{tc.tcNumber}</td>
                          <td className="p-3 font-semibold text-stone-900">{tc.student?.fullName}</td>
                          <td className="p-3 font-mono text-stone-500">{tc.student?.admissionNo}</td>
                          <td className="p-3 text-stone-600">{tc.class?.name}-{tc.section?.name} ({tc.session?.name})</td>
                          <td className="p-3 text-stone-500">
                            {new Date(tc.dateOfIssue).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              tc.status === "ISSUED"
                                ? "bg-emerald-100 text-emerald-700"
                                : tc.status === "CANCELLED"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-stone-100 text-stone-500"
                            }`}>
                              {tc.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => triggerPrintPreview(tc)}
                              className="text-[11px] h-7 px-2.5 font-bold"
                            >
                              Details / Print
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {regTotal > regPageSize && (
                <div className="flex justify-between items-center text-xs text-stone-500 pt-2">
                  <span>Showing {(regPage - 1) * regPageSize + 1} to {Math.min(regPage * regPageSize, regTotal)} of {regTotal} records</span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={regPage === 1}
                      onClick={() => setRegPage(p => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={regPage * regPageSize >= regTotal}
                      onClick={() => setRegPage(p => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}

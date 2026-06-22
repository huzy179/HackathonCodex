"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  FileCheck, 
  Cpu, 
  ShieldCheck, 
  Loader2, 
  RefreshCw, 
  User,
  DollarSign,
  Calendar,
  Anchor,
  Globe,
  Edit2,
  Copy,
  Mail,
  Check,
  ListTodo,
  Clock
} from "lucide-react";

interface ExtractedDoc {
  invoice_number: string;
  invoice_number_quote: string;
  total_amount: number;
  total_amount_quote: string;
  currency: string;
  currency_quote: string;
  shipment_date: string;
  shipment_date_quote: string;
  port_of_loading: string;
  port_of_loading_quote: string;
  beneficiary_name: string;
  beneficiary_name_quote: string;
}

interface Discrepancy {
  field: string;
  actual_value: string;
  expected_value: string;
  reason: string;
  severity: string;
}

interface CheckResult {
  status: string;
  extracted: ExtractedDoc;
  discrepancies: Discrepancy[];
  waiver_draft?: string;
}

interface AuditLog {
  time: string;
  message: string;
  type: "info" | "success" | "warning" | "edit";
}

export default function Home() {
  // L/C Terms Form State
  const [lcTerms, setLcTerms] = useState({
    max_amount: "50000",
    currency: "USD",
    latest_shipment: "2026-06-30",
    beneficiary_name: "GLOBAL TRADING CORP",
    port_of_loading: "HAIPHONG PORT"
  });

  // Files State
  const [file, setFile] = useState<File | null>(null);
  
  // Loading & Result States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable state (HITL)
  const [extractedDoc, setExtractedDoc] = useState<ExtractedDoc | null>(null);
  const [discrepancyList, setDiscrepancyList] = useState<Discrepancy[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Audit Logs (Audit Trail)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Signing Modal State
  const [isSigning, setIsSigning] = useState(false);
  const [signStatus, setSignStatus] = useState<"connecting" | "signing" | "success" | "idle">("idle");
  const [txHash, setTxHash] = useState("");

  // Copy email status
  const [copied, setCopied] = useState(false);

  // Add Log to Audit Trail
  const addAuditLog = useCallback((msg: string, type: "info" | "success" | "warning" | "edit") => {
    const timeStr = new Date().toLocaleTimeString();
    setAuditLogs(prev => [{ time: timeStr, message: msg, type }, ...prev]);
  }, []);

  // Recalculate discrepancies on client side for HITL
  const recalculateDiscrepancies = useCallback((updatedExt: ExtractedDoc) => {
    const list: Discrepancy[] = [];
    
    // 1. Total Amount
    const maxAmt = parseFloat(lcTerms.max_amount);
    if (!isNaN(maxAmt) && updatedExt.total_amount > maxAmt) {
      list.push({
        field: "total_amount",
        actual_value: `${updatedExt.total_amount.toLocaleString()} ${updatedExt.currency}`,
        expected_value: `<= ${maxAmt.toLocaleString()} ${lcTerms.currency}`,
        reason: `Tổng số tiền vượt hạn mức L/C cho phép (Lệch ${(updatedExt.total_amount - maxAmt).toLocaleString()})`,
        severity: "Error"
      });
    }

    // 2. Currency
    if (updatedExt.currency.trim().toUpperCase() !== lcTerms.currency.trim().toUpperCase()) {
      list.push({
        field: "currency",
        actual_value: updatedExt.currency,
        expected_value: lcTerms.currency,
        reason: "Loại tiền tệ thanh toán không trùng khớp với điều khoản L/C",
        severity: "Error"
      });
    }

    // 3. Shipment Date
    if (updatedExt.shipment_date && lcTerms.latest_shipment) {
      const extDate = new Date(updatedExt.shipment_date);
      const lcDate = new Date(lcTerms.latest_shipment);
      if (extDate > lcDate) {
        list.push({
          field: "shipment_date",
          actual_value: updatedExt.shipment_date,
          expected_value: `Trước hoặc bằng ${lcTerms.latest_shipment}`,
          reason: `Ngày giao hàng thực tế (${updatedExt.shipment_date}) muộn hơn thời hạn giao hàng của L/C (${lcTerms.latest_shipment})`,
          severity: "Error"
        });
      }
    }

    // 4. Beneficiary Name
    if (updatedExt.beneficiary_name.trim().toLowerCase() !== lcTerms.beneficiary_name.trim().toLowerCase()) {
      list.push({
        field: "beneficiary_name",
        actual_value: updatedExt.beneficiary_name,
        expected_value: lcTerms.beneficiary_name,
        reason: "Tên bên thụ hưởng không khớp chuẩn với L/C (Strict Compliance)",
        severity: "Error"
      });
    }

    // 5. Port of Loading
    if (updatedExt.port_of_loading.trim().toLowerCase() !== lcTerms.port_of_loading.trim().toLowerCase()) {
      list.push({
        field: "port_of_loading",
        actual_value: updatedExt.port_of_loading,
        expected_value: lcTerms.port_of_loading,
        reason: "Cảng bốc hàng không trùng khớp với điều khoản L/C",
        severity: "Warning"
      });
    }

    setDiscrepancyList(list);
  }, [lcTerms]);

  // Handle Form Input Change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLcTerms(prev => ({ ...prev, [name]: value }));
  };

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setError(null);
      addAuditLog(`Đã tải lên tệp chứng từ: ${selectedFile.name}`, "info");
    }
  }, [addAuditLog]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false
  });

  // Submit check request to FastAPI
  const handleCheck = async () => {
    if (!file) {
      setError("Vui lòng tải lên file PDF chứng từ cần đối chiếu.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setExtractedDoc(null);
    setDiscrepancyList([]);

    try {
      setLoadingStep("1. Đang trích xuất văn bản từ PDF (PyMuPDF)...");
      await new Promise(r => setTimeout(r, 600)); 
      
      setLoadingStep("2. Agent 1: Đang bóc tách dữ liệu & trích nguồn minh chứng (GPT-4o)...");
      await new Promise(r => setTimeout(r, 600));

      setLoadingStep("3. Agent 2: Kiểm toán viên độc lập đang rà soát chéo sửa sai sót (GPT-4o)...");
      await new Promise(r => setTimeout(r, 600));

      setLoadingStep("4. Đang đối chiếu luật nghiệp vụ L/C (Business Rules)...");

      const formData = new FormData();
      formData.append("pdf_file", file);
      formData.append("lc_rules", JSON.stringify(lcTerms));

      const response = await axios.post("http://localhost:8000/api/v1/check-lc", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setResult(response.data);
      setExtractedDoc(response.data.extracted);
      setDiscrepancyList(response.data.discrepancies);
      
      addAuditLog("Hoàn tất bóc tách & kiểm toán chéo dữ liệu qua Multi-Agent (Agent 1 & Agent 2)", "success");
      if (response.data.discrepancies.length > 0) {
        addAuditLog(`Đối chiếu hoàn tất: Phát hiện ${response.data.discrepancies.length} bất hợp lệ. AI đã tự soạn thư xin vướng mắc (Waiver Letter)`, "warning");
      } else {
        addAuditLog("Đối chiếu hoàn tất: Bộ chứng từ tuân thủ tuyệt đối điều khoản L/C", "success");
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail || 
        "Đã xảy ra lỗi khi kết nối với máy chủ API. Hãy đảm bảo Backend (FastAPI) đang chạy tại port 8000."
      );
      addAuditLog("Quá trình bóc tách lỗi: Có lỗi xảy ra trong kết nối máy chủ API", "warning");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  // Mock Signing Event (SmartCA)
  const handleSign = () => {
    setIsSigning(true);
    setSignStatus("connecting");
    addAuditLog("Bắt đầu kết nối cổng ký số VNPT SmartCA...", "info");
    
    setTimeout(() => {
      setSignStatus("signing");
      addAuditLog("Đang truyền dữ liệu băm và áp dụng chữ ký số...", "info");
      
      setTimeout(() => {
        setSignStatus("success");
        const newHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
        setTxHash(newHash);
        addAuditLog(`Đã ký duyệt báo cáo thành công qua SmartCA. TxHash: ${newHash.slice(0, 16)}...`, "success");
      }, 1500);
    }, 1000);
  };

  // Start editing a field (HITL)
  const startEditing = (field: keyof ExtractedDoc) => {
    if (!extractedDoc) return;
    setEditingField(field);
    setEditValue(extractedDoc[field].toString());
  };

  // Save edited value (HITL)
  const saveEdit = (field: keyof ExtractedDoc) => {
    if (!extractedDoc) return;
    
    let updatedVal: any = editValue;
    if (field === "total_amount") {
      updatedVal = parseFloat(editValue) || 0.0;
    }

    const updatedDoc = {
      ...extractedDoc,
      [field]: updatedVal
    };

    const labels: Record<string, string> = {
      beneficiary_name: "Người thụ hưởng",
      total_amount: "Tổng số tiền",
      currency: "Đồng tiền",
      shipment_date: "Ngày giao hàng",
      port_of_loading: "Cảng bốc hàng"
    };

    setExtractedDoc(updatedDoc);
    setEditingField(null);
    recalculateDiscrepancies(updatedDoc);
    addAuditLog(`Chuyên viên điều chỉnh thủ công trường '${labels[field]}' thành: '${updatedVal}' (HITL)`, "edit");
  };

  // Copy waiver draft email to clipboard
  const handleCopyEmail = () => {
    if (result?.waiver_draft) {
      navigator.clipboard.writeText(result.waiver_draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addAuditLog("Đã sao chép Thư đề xuất bỏ qua lỗi (Waiver Letter) vào Clipboard", "info");
    }
  };

  const getDiscrepancy = (fieldName: string) => {
    return discrepancyList.find(d => d.field === fieldName);
  };

  const getFieldStatus = (fieldName: string) => {
    if (!extractedDoc) return null;
    const disc = getDiscrepancy(fieldName);
    if (disc) {
      return {
        isValid: false,
        actual: extractedDoc[fieldName as keyof ExtractedDoc].toString() + (fieldName === "total_amount" ? ` ${extractedDoc.currency}` : ""),
        expected: disc.expected_value,
        reason: disc.reason,
        severity: disc.severity,
        quote: extractedDoc[`${fieldName}_quote` as keyof ExtractedDoc] || ""
      };
    }
    
    let actualValue = "";
    let expectedValue = "";
    if (fieldName === "invoice_number") {
      actualValue = extractedDoc.invoice_number;
      expectedValue = "Tùy ý / Có hợp lệ";
    } else if (fieldName === "total_amount") {
      actualValue = `${extractedDoc.total_amount.toLocaleString()} ${extractedDoc.currency}`;
      expectedValue = `<= ${parseFloat(lcTerms.max_amount).toLocaleString()} ${lcTerms.currency}`;
    } else if (fieldName === "currency") {
      actualValue = extractedDoc.currency;
      expectedValue = lcTerms.currency;
    } else if (fieldName === "shipment_date") {
      actualValue = extractedDoc.shipment_date;
      expectedValue = `Trước ${lcTerms.latest_shipment}`;
    } else if (fieldName === "beneficiary_name") {
      actualValue = extractedDoc.beneficiary_name;
      expectedValue = lcTerms.beneficiary_name;
    } else if (fieldName === "port_of_loading") {
      actualValue = extractedDoc.port_of_loading;
      expectedValue = lcTerms.port_of_loading;
    }

    return {
      isValid: true,
      actual: actualValue,
      expected: expectedValue,
      reason: "Hoàn toàn trùng khớp và hợp lệ",
      quote: extractedDoc[`${fieldName}_quote` as keyof ExtractedDoc] || ""
    };
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-16">
      {/* Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-200 via-teal-200 to-white bg-clip-text text-transparent">
                LC-Vision
              </h1>
              <p className="text-xs text-slate-400 font-medium">AI-Powered UCP 600 Compliance Checker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs text-slate-300 font-mono">v1.2.0 (Multi-Agent & Explainable)</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: Inputs (JSON Terms + File Upload) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {/* L/C Requirements Card */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="text-indigo-400 h-5 w-5" />
              <h2 className="text-lg font-semibold text-slate-200">1. Điều khoản L/C tham chiếu</h2>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold mb-1 block">Tên người thụ hưởng (Beneficiary)</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    name="beneficiary_name"
                    value={lcTerms.beneficiary_name}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="E.g., GLOBAL TRADING CORP"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 font-semibold mb-1 block">Hạn mức tối đa</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="number"
                      name="max_amount"
                      value={lcTerms.max_amount}
                      onChange={handleInputChange}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="E.g., 50000"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold mb-1 block">Đơn vị tiền tệ (Currency)</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      name="currency"
                      value={lcTerms.currency}
                      onChange={handleInputChange}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="E.g., USD"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 font-semibold mb-1 block">Hạn cuối giao hàng</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="date"
                      name="latest_shipment"
                      value={lcTerms.latest_shipment}
                      onChange={handleInputChange}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold mb-1 block">Cảng bốc hàng (Port of Loading)</label>
                  <div className="relative">
                    <Anchor className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      name="port_of_loading"
                      value={lcTerms.port_of_loading}
                      onChange={handleInputChange}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="E.g., HAIPHONG PORT"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PDF Document Upload Card */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="text-teal-400 h-5 w-5" />
              <h2 className="text-lg font-semibold text-slate-200">2. Chứng từ thương mại (PDF)</h2>
            </div>

            <div 
              {...getRootProps()} 
              className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all duration-300 ${
                isDragActive 
                  ? "border-teal-500 bg-teal-950/10" 
                  : file 
                    ? "border-slate-700 bg-slate-900/30" 
                    : "border-slate-800 hover:border-slate-700 bg-slate-900/10"
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="text-center">
                  <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 text-emerald-400">
                    <FileCheck className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200 truncate max-w-[280px]">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setResult(null);
                      setExtractedDoc(null);
                      setDiscrepancyList([]);
                      setAuditLogs([]);
                    }}
                    className="mt-4 text-xs font-semibold text-rose-400 hover:text-rose-300 underline"
                  >
                    Hủy bỏ & Chọn lại
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="h-14 w-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-300">
                    Kéo & thả file PDF chứng từ vào đây
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Hoặc click để duyệt file từ máy tính
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2.5 items-start">
                <XCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleCheck}
              disabled={isLoading || !file}
              className="mt-6 w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-teal-500 text-white font-semibold text-sm hover:from-indigo-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-indigo-500/10"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang phân tích Multi-Agent...</span>
                </>
              ) : (
                <>
                  <Cpu className="h-4 w-4" />
                  <span>Chạy đối chiếu AI</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right column: Results & Sign Area */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Waiting/Processing State */}
          {isLoading && (
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-12 shadow-xl backdrop-blur-sm flex flex-col items-center justify-center text-center min-h-[480px]">
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mb-6" />
              <h3 className="text-lg font-semibold text-slate-200 mb-2">Đang xử lý chứng từ qua Multi-Agent</h3>
              <p className="text-sm text-slate-400 max-w-sm mb-6">
                Các chuyên viên AI độc lập đang đọc, kiểm soát, đối chiếu chéo số liệu để đảm bảo độ chính xác tuyệt đối.
              </p>
              
              <div className="w-64 bg-slate-900 rounded-full h-2 border border-slate-800 overflow-hidden relative">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full animate-[loading_2s_infinite]"></div>
              </div>
              <p className="text-xs text-indigo-400 font-mono mt-4 animate-pulse">
                {loadingStep}
              </p>
            </div>
          )}

          {/* Idle state */}
          {!isLoading && !extractedDoc && (
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-12 shadow-xl backdrop-blur-sm flex flex-col items-center justify-center text-center min-h-[480px]">
              <div className="h-16 w-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-6">
                <FileText className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-300 mb-2">Báo Cáo Đối Chiếu</h3>
              <p className="text-sm text-slate-500 max-w-md">
                Tải lên chứng từ dạng PDF và điền các điều khoản L/C cần đối chiếu ở cột bên trái để chạy phân tích tuân thủ.
              </p>
            </div>
          )}

          {/* Results Render */}
          {!isLoading && extractedDoc && (
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex flex-col justify-between min-h-[560px]">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-200">Báo cáo sai biệt (Compliance Report)</h2>
                    <p className="text-xs text-slate-400">Số hóa đơn: <span className="font-mono text-indigo-400">{extractedDoc.invoice_number || "N/A"}</span></p>
                  </div>
                  <div className={`px-3.5 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                    discrepancyList.length > 0
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  }`}>
                    {discrepancyList.length > 0 ? (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Phát hiện {discrepancyList.length} bất hợp lệ</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Chứng từ tuân thủ tuyệt đối</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-4 text-xs text-slate-400 bg-slate-900 border border-indigo-500/10 rounded-xl p-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Human-in-the-Loop (HITL):</strong> Chuyên viên ngân hàng có thể bấm vào nút bút chì ở cột <strong>Chứng từ thực tế (AI)</strong> để sửa đổi trực tiếp dữ liệu. Hệ thống sẽ so khớp lại ngay tức thì.
                  </span>
                </div>

                {/* Diff table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Trường dữ liệu</th>
                        <th className="pb-3 font-semibold">Yêu cầu L/C</th>
                        <th className="pb-3 font-semibold">Chứng từ thực tế (AI)</th>
                        <th className="pb-3 font-semibold text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-sm">
                      {["beneficiary_name", "total_amount", "currency", "shipment_date", "port_of_loading"].map(field => {
                        const status = getFieldStatus(field);
                        if (!status) return null;

                        const labels: Record<string, string> = {
                          beneficiary_name: "Người thụ hưởng",
                          total_amount: "Tổng số tiền",
                          currency: "Đồng tiền",
                          shipment_date: "Ngày giao hàng",
                          port_of_loading: "Cảng bốc hàng"
                        };

                        const isEditing = editingField === field;

                        return (
                          <React.Fragment key={field}>
                            <tr className={`transition-colors ${status.isValid ? "hover:bg-slate-900/10" : "bg-rose-950/10"}`}>
                              <td className="py-4 font-medium text-slate-300">
                                {labels[field]}
                              </td>
                              <td className="py-4 text-slate-400 font-mono text-xs">
                                {status.expected}
                              </td>
                              <td className="py-2.5">
                                {isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type={field === "total_amount" ? "number" : "text"}
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="bg-slate-900 border border-indigo-500/50 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none w-36 font-mono"
                                      autoFocus
                                    />
                                    <button 
                                      onClick={() => saveEdit(field as keyof ExtractedDoc)}
                                      className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                                    >
                                      <Check className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 group">
                                      <span className={`font-mono text-xs font-medium ${status.isValid ? "text-slate-200" : "text-rose-400"}`}>
                                        {status.actual}
                                      </span>
                                      <button 
                                        onClick={() => startEditing(field as keyof ExtractedDoc)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-indigo-400"
                                        title="Click để sửa lỗi thủ công"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    {/* Explainable AI: Raw quotes */}
                                    {status.quote && (
                                      <div className="text-[10px] text-slate-500 italic max-w-xs break-all bg-slate-900/40 p-1.5 rounded border border-slate-800/40">
                                        Minh chứng gốc: "{status.quote}"
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-4 text-center">
                                {status.isValid ? (
                                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-400">
                                    <CheckCircle className="h-4 w-4" />
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${
                                    status.severity === "Warning" 
                                      ? "bg-amber-500/10 text-amber-400" 
                                      : "bg-rose-500/10 text-rose-400"
                                  }`}>
                                    {status.severity === "Warning" ? (
                                      <AlertTriangle className="h-4 w-4" />
                                    ) : (
                                      <XCircle className="h-4 w-4" />
                                    )}
                                  </span>
                                )}
                              </td>
                            </tr>
                            {!status.isValid && (
                              <tr className="bg-rose-950/5">
                                <td colSpan={4} className="py-2 px-4 text-xs text-rose-400/90 font-medium italic border-l-2 border-rose-500">
                                  {status.reason}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action signature button */}
              <div className="border-t border-slate-800/80 pt-4 mt-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="text-xs text-slate-400 text-center sm:text-left">
                  Báo cáo được lập tự động bởi AI dựa trên quy tắc UCP 600.
                </div>
                <button
                  onClick={handleSign}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/15"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Ký Duyệt Báo Cáo (SmartCA)</span>
                </button>
              </div>

            </div>
          )}

        </section>

      </main>

      {/* Next Action Area - Waivers (Appears after successful sign) */}
      {!isLoading && extractedDoc && txHash && (
        <section className="max-w-7xl mx-auto px-6 mt-8">
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm animate-[fadeIn_0.5s_ease-out]">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Mail className="text-indigo-400 h-5 w-5" />
                <h3 className="text-lg font-bold text-slate-200">Hành động tiếp theo (Next Action) — Soạn thư xin vướng mắc (Auto-Waiver)</h3>
              </div>
              <div className="flex items-center gap-2 mt-2 md:mt-0">
                <button
                  onClick={handleCopyEmail}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {copied ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Đã sao chép!
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Copy className="h-3.5 w-3.5" /> Sao chép thư
                    </span>
                  )}
                </button>
                <a
                  href={`mailto:?subject=Thong bao vướng mắc L/C &body=${encodeURIComponent(result?.waiver_draft || "")}`}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Gửi Email</span>
                </a>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              AI đã tự động viết thư song ngữ (Việt - Anh) dựa trên các lỗi sai biệt còn tồn tại để gửi cho Người mua hàng (Applicant) yêu cầu chấp nhận bỏ qua lỗi (Waiver).
            </p>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-sans text-sm text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
              {result?.waiver_draft}
            </div>
          </div>
        </section>
      )}

      {/* Audit Trail Section */}
      {!isLoading && auditLogs.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 mt-8">
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-4 mb-4">
              <Clock className="text-teal-400 h-5 w-5" />
              <h3 className="text-lg font-bold text-slate-200">Nhật ký vận hành (Audit Trail)</h3>
            </div>
            
            <div className="relative border-l-2 border-slate-800 pl-6 ml-3 space-y-4 max-h-60 overflow-y-auto">
              {auditLogs.map((log, index) => {
                let dotColor = "bg-slate-700";
                if (log.type === "success") dotColor = "bg-emerald-500";
                if (log.type === "warning") dotColor = "bg-rose-500";
                if (log.type === "edit") dotColor = "bg-indigo-500";

                return (
                  <div key={index} className="relative">
                    {/* Dot decoration */}
                    <span className={`absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border border-slate-900 ${dotColor}`}></span>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <p className="text-xs text-slate-400 font-mono">{log.time}</p>
                      <p className="text-sm text-slate-200 flex-1 sm:ml-4 font-medium">{log.message}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                        log.type === "success" 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" 
                          : log.type === "warning"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                            : log.type === "edit"
                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/10"
                              : "bg-slate-800 text-slate-400"
                      }`}>
                        {log.type === "edit" ? "SỬA TAY" : log.type}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* VNPT SmartCA Simulated Modal */}
      {isSigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            
            {/* Header decor */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-indigo-500"></div>

            {signStatus === "connecting" && (
              <div className="text-center py-6">
                <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-200 mb-1">Kết nối VNPT SmartCA</h3>
                <p className="text-sm text-slate-400">Đang thiết lập cổng liên kết ký điện tử bảo mật...</p>
              </div>
            )}

            {signStatus === "signing" && (
              <div className="text-center py-6">
                <RefreshCw className="h-10 w-10 text-indigo-400 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-200 mb-1">Đang thực hiện ký số</h3>
                <p className="text-sm text-slate-400">Đang mã hóa văn bản báo cáo và gán chữ ký số...</p>
              </div>
            )}

            {signStatus === "success" && (
              <div className="text-center py-4">
                <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-2">Đã Ký Số Thành Công!</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Báo cáo sai biệt đã được xác thực mã hóa chính thức bằng chữ ký số SmartCA. Phần tiếp theo ("Next Action") đã xuất hiện bên dưới trang.
                </p>
                
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-left mb-6 font-mono text-[10px] text-slate-400 select-all">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1 font-sans font-bold">Mã băm giao dịch (TxHash)</div>
                  <span className="break-all">{txHash}</span>
                </div>

                <button
                  onClick={() => setIsSigning(false)}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors"
                >
                  Đóng cửa sổ
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Tailwind internal animation config helper */}
      <style jsx global>{`
        @keyframes loading {
          0% { left: -100%; width: 50%; }
          50% { width: 40%; }
          100% { left: 100%; width: 50%; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

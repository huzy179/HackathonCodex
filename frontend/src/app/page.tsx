"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { ResultsCard } from "./components/ResultsCard";
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
  Clock,
  HelpCircle,
  Terminal
} from "lucide-react";

export interface ExtractedDoc {
  invoice_number: string;
  invoice_number_quote: string;
  invoice_number_confidence: number;
  
  total_amount: number;
  total_amount_quote: string;
  total_amount_confidence: number;
  
  currency: string;
  currency_quote: string;
  currency_confidence: number;
  
  shipment_date: string;
  shipment_date_quote: string;
  shipment_date_confidence: number;
  
  port_of_loading: string;
  port_of_loading_quote: string;
  port_of_loading_confidence: number;
  
  beneficiary_name: string;
  beneficiary_name_quote: string;
  beneficiary_name_confidence: number;

  applicant_name: string;
  applicant_name_quote: string;
  applicant_name_confidence: number;

  port_of_discharge: string;
  port_of_discharge_quote: string;
  port_of_discharge_confidence: number;

  goods_description: string;
  goods_description_quote: string;
  goods_description_confidence: number;

  incoterms: string;
  incoterms_quote: string;
  incoterms_confidence: number;
}

export interface Discrepancy {
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
  // Navigation & Screens (BA v2.0 TO-BE Journey)
  const [screen, setScreen] = useState<"login" | "dashboard" | "upload" | "safety_gate" | "result">("login");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [loginError, setLoginError] = useState("");

  // Dashboard Case list state
  const [dashboardCases, setDashboardCases] = useState<any[]>([
    { id: "CASE-001", name: "Bộ hồ sơ xuất khẩu Gạo sang Hamburg", date: "2026-06-24", status: "Compliant", conclusion: "Đã giải ngân" },
    { id: "CASE-002", name: "Bộ hồ sơ Sắt thép từ Haiphong", date: "2026-06-23", status: "Closed", conclusion: "Từ chối thanh toán" }
  ]);

  // L/C Terms Form State
  const [lcTerms, setLcTerms] = useState({
    max_amount: "50000",
    currency: "USD",
    latest_shipment: "2026-06-30",
    beneficiary_name: "GLOBAL TRADING CORP",
    port_of_loading: "HAIPHONG PORT",
    applicant_name: "IMPORT CO LTD",
    expiry_date: "2026-07-15",
    port_of_discharge: "HAMBURG PORT",
    goods_description: "AGRICULTURAL PRODUCTS",
    incoterms: "CIF",
    partial_shipment: "ALLOWED",
    transhipment: "PROHIBITED",
    amount_tolerance: "5/5"
  });

  // SWIFT Parsing Mode State
  const [lcInputMode, setLcInputMode] = useState<"form" | "swift">("form");
  const [swiftText, setSwiftText] = useState("");
  const [isParsingSwift, setIsParsingSwift] = useState(false);

  // L/C File Upload State
  const [lcFile, setLcFile] = useState<File | null>(null);
  const [isLCParsing, setIsLCParsing] = useState(false);
  const [isLCOverallParsing, setIsLCOverallParsing] = useState(false);
  const [lcConfidences, setLcConfidences] = useState<Record<string, number>>({});

  // Files State
  const [files, setFiles] = useState<File[]>([]);
  
  // Dedicated Upload Slots State
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [blFile, setBlFile] = useState<File | null>(null);
  const [plFile, setPlFile] = useState<File | null>(null);
  const [coFile, setCoFile] = useState<File | null>(null);
  const [cqFile, setCqFile] = useState<File | null>(null);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [fileTypesMap, setFileTypesMap] = useState<Record<string, string>>({});
  
  // Loading & Result States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extracted Docs for BL, PL, CO, CQ, Cross checking and Tab Selection
  const [extractedBl, setExtractedBl] = useState<any | null>(null);
  const [extractedPl, setExtractedPl] = useState<any | null>(null);
  const [extractedCo, setExtractedCo] = useState<any | null>(null);
  const [extractedCq, setExtractedCq] = useState<any | null>(null);
  const [extractedInsurance, setExtractedInsurance] = useState<any | null>(null);
  const [layer1Discrepancies, setLayer1Discrepancies] = useState<Discrepancy[]>([]);
  const [crossDiscrepancies, setCrossDiscrepancies] = useState<Discrepancy[]>([]);
  const [cannotWaive, setCannotWaive] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"internal" | "cross" | "lc">("internal");

  // HITL stages
  const [resultStep, setResultStep] = useState<"ocr_check" | "compliance_check">("ocr_check");
  const [activeOcrTab, setActiveOcrTab] = useState<"invoice" | "bl" | "pl" | "co" | "cq" | "insurance">("invoice");

  // Live Terminal Logs from Backend Streaming
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Editable state (HITL)
  const [extractedDoc, setExtractedDoc] = useState<ExtractedDoc | null>(null);
  const [discrepancyList, setDiscrepancyList] = useState<Discrepancy[]>([]);
  const [editingDoc, setEditingDoc] = useState<"invoice" | "bl" | "pl" | "co" | "cq" | "insurance" | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Audit Logs (Audit Trail)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Load Audit Logs from Backend on Mount
  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/v1/audit-trail`);
        setAuditLogs(response.data);
      } catch (err) {
        console.error("Không thể tải Audit Trail từ Backend:", err);
      }
    };
    fetchAuditLogs();
  }, []);

  const badgeColors: Record<string, string> = {
    "2": "bg-indigo-600",
    "3": "bg-violet-600",
    "4": "bg-emerald-600",
    "5": "bg-amber-600",
    "6": "bg-rose-600",
  };

  const renderUploadSlot = (
    label: string,
    file: File | null,
    setFile: (file: File | null) => void,
    id: string,
    description: string,
    badgeNum?: number
  ) => {
    const badgeCls = badgeNum !== undefined ? (badgeColors[String(badgeNum)] || "bg-blue-600") : "bg-blue-600";
    return (
      <div className={`border-2 rounded-2xl p-4 bg-white transition-all flex flex-col justify-between min-h-[150px] ${
        file ? "border-emerald-200 bg-emerald-50/20 shadow-sm" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      }`}>
        <div className="flex justify-between items-start gap-2 mb-3">
          <div className="flex items-start gap-2.5">
            {badgeNum !== undefined && (
              <span className={`mt-0.5 shrink-0 h-6 w-6 rounded-lg ${badgeCls} text-white text-[10px] font-bold flex items-center justify-center shadow-sm`}>
                {String(badgeNum).padStart(2, "0")}
              </span>
            )}
            <div>
              <span className="text-sm font-bold text-slate-800 block leading-tight">{label}</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">{description}</span>
            </div>
          </div>
          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                addAuditLog(`Đã xóa tệp trong ô ${label}`, "info");
              }}
              className="text-rose-500 hover:text-rose-700 transition-colors p-0.5 shrink-0"
              title="Xóa tệp"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        {file ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-800">
            <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="truncate font-semibold flex-1" title={file.name}>{file.name}</span>
            <span className="text-emerald-600 font-mono text-[10px] shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
          </div>
        ) : (
          <div className="relative border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl p-3 bg-slate-50 text-center cursor-pointer transition-all group">
            <input
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setError(null);
                  addAuditLog(`Đã chọn tệp cho ${label}: ${f.name}`, "info");
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id={id}
            />
            <div className="flex items-center justify-center gap-2 text-slate-400 group-hover:text-blue-600 transition-colors">
              <Upload className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold">Chọn tệp PDF / DOCX / DOC</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Decision States (BA v2.0 TO-BE)
  const [decisionStatus, setDecisionStatus] = useState<"idle" | "payout" | "waiver" | "rejected" | "pending_customer" | "compliant_with_waiver">("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signStatus, setSignStatus] = useState<"connecting" | "signing" | "success" | "idle">("idle");
  const [txHash, setTxHash] = useState("");

  // Copy email status
  const [copied, setCopied] = useState(false);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Add Log to Audit Trail
  const addAuditLog = useCallback((msg: string, type: "info" | "success" | "warning" | "edit") => {
    const timeStr = new Date().toLocaleTimeString();
    setAuditLogs(prev => [{ time: timeStr, message: msg, type }, ...prev]);
    axios.post(`${API_BASE}/api/v1/audit-trail`, {
      time: timeStr,
      message: msg,
      type
    }).catch(err => {
      console.error("Không thể lưu Audit Log lên Backend:", err);
    });
  }, []);

  // Recalculate discrepancies on client side for HITL
  const recalculateDiscrepancies = useCallback((updatedExt: ExtractedDoc) => {
    const list: Discrepancy[] = [];
    
    // 1. Total Amount with Tolerance
    const maxAmt = parseFloat(lcTerms.max_amount);
    const amountTolStr = (lcTerms.amount_tolerance || "").trim().toLowerCase();
    let positiveTol = 5.0;
    let negativeTol = 5.0;
    if (amountTolStr === "0" || amountTolStr.includes("exactly")) {
      positiveTol = 0.0;
      negativeTol = 0.0;
    } else if (amountTolStr.includes("/")) {
      const parts = amountTolStr.split("/");
      const p1 = parseFloat(parts[0].replace("%", "").trim());
      const p2 = parseFloat(parts[1].replace("%", "").trim());
      if (!isNaN(p1)) positiveTol = p1;
      if (!isNaN(p2)) negativeTol = p2;
    } else if (amountTolStr) {
      const val = parseFloat(amountTolStr.replace("%", "").trim());
      if (!isNaN(val)) {
        positiveTol = val;
        negativeTol = val;
      }
    }
    
    const maxAllowed = maxAmt * (1 + positiveTol / 100);
    if (!isNaN(maxAmt) && updatedExt.total_amount > maxAllowed) {
      list.push({
        field: "total_amount",
        actual_value: `${updatedExt.total_amount.toLocaleString()} ${updatedExt.currency}`,
        expected_value: `<= ${maxAllowed.toLocaleString()} ${lcTerms.currency} (Hạn mức ${maxAmt.toLocaleString()} + ${positiveTol}% dung sai)`,
        reason: `Tổng số tiền vượt hạn mức L/C cho phép sau khi tính dung sai (Lệch ${(updatedExt.total_amount - maxAllowed).toLocaleString()})`,
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

    // 4. Expiry Date
    if (updatedExt.shipment_date && lcTerms.expiry_date) {
      const extDate = new Date(updatedExt.shipment_date);
      const expDate = new Date(lcTerms.expiry_date);
      if (extDate > expDate) {
        list.push({
          field: "shipment_date",
          actual_value: updatedExt.shipment_date,
          expected_value: `Trước hoặc bằng Ngày hết hạn ${lcTerms.expiry_date}`,
          reason: `Ngày giao hàng/trình chứng từ (${updatedExt.shipment_date}) muộn hơn Ngày hết hạn của L/C (${lcTerms.expiry_date})`,
          severity: "Error"
        });
      }
    }

    // 5. Beneficiary Name
    if (updatedExt.beneficiary_name.trim().toLowerCase() !== lcTerms.beneficiary_name.trim().toLowerCase()) {
      list.push({
        field: "beneficiary_name",
        actual_value: updatedExt.beneficiary_name,
        expected_value: lcTerms.beneficiary_name,
        reason: "Tên bên thụ hưởng không khớp chuẩn với L/C (Strict Compliance)",
        severity: "Error"
      });
    }

    // 6. Applicant Name
    if (updatedExt.applicant_name && lcTerms.applicant_name) {
      if (updatedExt.applicant_name.trim().toLowerCase() !== lcTerms.applicant_name.trim().toLowerCase()) {
        list.push({
          field: "applicant_name",
          actual_value: updatedExt.applicant_name,
          expected_value: lcTerms.applicant_name,
          reason: "Tên người mua (Applicant) không khớp chuẩn với L/C (UCP 600 Art.18)",
          severity: "Error"
        });
      }
    }

    // 7. Port of Loading
    if (updatedExt.port_of_loading.trim().toLowerCase() !== lcTerms.port_of_loading.trim().toLowerCase()) {
      list.push({
        field: "port_of_loading",
        actual_value: updatedExt.port_of_loading,
        expected_value: lcTerms.port_of_loading,
        reason: "Cảng bốc hàng không trùng khớp với điều khoản L/C",
        severity: "Warning"
      });
    }

    // 8. Port of Discharge
    if (updatedExt.port_of_discharge && lcTerms.port_of_discharge) {
      if (updatedExt.port_of_discharge.trim().toLowerCase() !== lcTerms.port_of_discharge.trim().toLowerCase()) {
        list.push({
          field: "port_of_discharge",
          actual_value: updatedExt.port_of_discharge,
          expected_value: lcTerms.port_of_discharge,
          reason: "Cảng dỡ hàng không trùng khớp với điều khoản L/C",
          severity: "Error"
        });
      }
    }

    // 9. Incoterms
    if (updatedExt.incoterms && lcTerms.incoterms) {
      if (!updatedExt.incoterms.trim().toLowerCase().includes(lcTerms.incoterms.trim().toLowerCase())) {
        list.push({
          field: "incoterms",
          actual_value: updatedExt.incoterms,
          expected_value: lcTerms.incoterms,
          reason: "Điều kiện giao hàng (Incoterms) không trùng khớp với L/C",
          severity: "Error"
        });
      }
    }

    // 10. Goods Description
    if (updatedExt.goods_description && lcTerms.goods_description) {
      const lcGoodsLower = lcTerms.goods_description.trim().toLowerCase();
      const extGoodsLower = updatedExt.goods_description.trim().toLowerCase();
      if (!extGoodsLower.includes(lcGoodsLower)) {
        const lcWords = lcGoodsLower.split(/\s+/).filter(w => w.length > 3);
        const extWords = extGoodsLower.split(/\s+/).filter(w => w.length > 3);
        const hasOverlap = lcWords.some(w => extWords.includes(w));
        if (!hasOverlap) {
          list.push({
            field: "goods_description",
            actual_value: updatedExt.goods_description,
            expected_value: lcTerms.goods_description,
            reason: "Mô tả hàng hóa không trùng khớp hoặc không tương đương với L/C",
            severity: "Error"
          });
        }
      }
    }

    setDiscrepancyList(list);

    // Recalculate Layer 2 Cross Check Discrepancies
    const crossList: Discrepancy[] = [];
    if (extractedBl) {
      // 1. Beneficiary (Invoice) vs Shipper (B/L)
      if (updatedExt.beneficiary_name && extractedBl.shipper_name) {
        const invBen = updatedExt.beneficiary_name.trim().toLowerCase();
        const blShip = extractedBl.shipper_name.trim().toLowerCase();
        if (invBen !== blShip && !invBen.includes(blShip) && !blShip.includes(invBen)) {
          crossList.push({
            field: "cross_beneficiary_shipper",
            actual_value: extractedBl.shipper_name,
            expected_value: updatedExt.beneficiary_name,
            reason: "Tên Shipper trên B/L không khớp với bên thụ hưởng (Beneficiary) trên Hóa đơn",
            severity: "Error"
          });
        }
      }

      // 2. Goods Description (Invoice) vs B/L
      if (updatedExt.goods_description && extractedBl.goods_description) {
        const invGoods = updatedExt.goods_description.trim().toLowerCase();
        const blGoods = extractedBl.goods_description.trim().toLowerCase();
        const getWords = (str: string) => new Set(str.split(/\s+/).filter(w => w.length > 3));
        const invWords = getWords(invGoods);
        const blWords = getWords(blGoods);
        const hasOverlap = Array.from(invWords).some(w => blWords.has(w));
        if (!hasOverlap && !invGoods.includes(blGoods) && !blGoods.includes(invGoods)) {
          crossList.push({
            field: "cross_goods_invoice_bl",
            actual_value: extractedBl.goods_description,
            expected_value: updatedExt.goods_description,
            reason: "Mô tả hàng hóa trên B/L không tương đồng với trên Hóa đơn thương mại",
            severity: "Error"
          });
        }
      }

      // 3. Port of Loading (Invoice) vs B/L
      if (updatedExt.port_of_loading && extractedBl.port_of_loading) {
        if (updatedExt.port_of_loading.trim().toLowerCase() !== extractedBl.port_of_loading.trim().toLowerCase()) {
          crossList.push({
            field: "cross_loading_port",
            actual_value: extractedBl.port_of_loading,
            expected_value: updatedExt.port_of_loading,
            reason: "Cảng bốc hàng trên B/L không khớp với Hóa đơn",
            severity: "Error"
          });
        }
      }

      // 4. Port of Discharge (Invoice) vs B/L
      if (updatedExt.port_of_discharge && extractedBl.port_of_discharge) {
        if (updatedExt.port_of_discharge.trim().toLowerCase() !== extractedBl.port_of_discharge.trim().toLowerCase()) {
          crossList.push({
            field: "cross_discharge_port",
            actual_value: extractedBl.port_of_discharge,
            expected_value: updatedExt.port_of_discharge,
            reason: "Cảng dỡ hàng trên B/L không khớp với Hóa đơn",
            severity: "Error"
          });
        }
      }
    }

    if (extractedPl) {
      // 1. Invoice vs Packing List Goods Description
      if (updatedExt.goods_description && extractedPl.goods_name) {
        const invGoods = updatedExt.goods_description.trim().toLowerCase();
        const plGoods = extractedPl.goods_name.trim().toLowerCase();
        const getWords = (str: string) => new Set(str.split(/\s+/).filter(w => w.length > 3));
        const invWords = getWords(invGoods);
        const plWords = getWords(plGoods);
        const hasOverlap = Array.from(invWords).some(w => plWords.has(w));
        if (!hasOverlap && !invGoods.includes(plGoods) && !plGoods.includes(invGoods)) {
          crossList.push({
            field: "cross_goods_invoice_pl",
            actual_value: extractedPl.goods_name,
            expected_value: updatedExt.goods_description,
            reason: "Mô tả hàng hóa trên Packing List không tương đồng với trên Hóa đơn",
            severity: "Error"
          });
        }
      }
    }

    setCrossDiscrepancies(crossList);
  }, [lcTerms, extractedBl, extractedPl]);

  // Handle Form Input Change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLcTerms(prev => ({ ...prev, [name]: value }));
  };

  // Call API to Parse SWIFT MT700
  const handleParseSwift = async () => {
    if (!swiftText.trim()) {
      alert("Vui lòng dán văn bản điện SWIFT MT700 vào trước.");
      return;
    }

    setIsParsingSwift(true);
    addAuditLog("Bắt đầu gọi AI phân tích điện SWIFT MT700...", "info");
    try {
      const response = await axios.post(`${API_BASE}/api/v1/parse-swift`, {
        swift_text: swiftText
      });
      
      if (response.data.status === "success" && response.data.lc_terms) {
        const terms = response.data.lc_terms;
        setLcTerms({
          max_amount: terms.max_amount.toString(),
          currency: terms.currency,
          latest_shipment: terms.latest_shipment,
          beneficiary_name: terms.beneficiary_name,
          port_of_loading: terms.port_of_loading,
          applicant_name: terms.applicant_name || "",
          expiry_date: terms.expiry_date || "",
          port_of_discharge: terms.port_of_discharge || "",
          goods_description: terms.goods_description || "",
          incoterms: terms.incoterms || "",
          partial_shipment: terms.partial_shipment || "",
          transhipment: terms.transhipment || "",
          amount_tolerance: terms.amount_tolerance || ""
        });
        
        // Extract confidences
        const confs: Record<string, number> = {};
        Object.keys(terms).forEach(key => {
          if (key.endsWith("_confidence")) {
            const fieldName = key.replace("_confidence", "");
            confs[fieldName] = terms[key];
          }
        });
        setLcConfidences(confs);
        
        addAuditLog("Giải mã điện SWIFT MT700 và điền tự động tham chiếu L/C thành công! Chuyển sang Safety Gate.", "success");
        setScreen("safety_gate");
      }
    } catch (err: any) {
      console.error(err);
      alert("Không thể giải mã điện SWIFT. Vui lòng kiểm tra lại kết nối backend hoặc key.");
      addAuditLog("Giải mã điện SWIFT thất bại.", "warning");
    } finally {
      setIsParsingSwift(false);
    }
  };

  // Call API to Extract L/C terms from uploaded PDF L/C file
  const handleLcFileUpload = async (file: File) => {
    setLcFile(file);
    setIsLCParsing(true);
    setError(null);
    addAuditLog(`Bắt đầu bóc tách điều khoản từ file L/C: ${file.name}...`, "info");
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await axios.post(`${API_BASE}/api/v1/extract-lc-file`, formData);
      if (response.data.status === "success" && response.data.lc_terms) {
        const terms = response.data.lc_terms;
        setLcTerms({
          max_amount: terms.max_amount.toString(),
          currency: terms.currency,
          latest_shipment: terms.latest_shipment,
          beneficiary_name: terms.beneficiary_name,
          port_of_loading: terms.port_of_loading,
          applicant_name: terms.applicant_name || "",
          expiry_date: terms.expiry_date || "",
          port_of_discharge: terms.port_of_discharge || "",
          goods_description: terms.goods_description || "",
          incoterms: terms.incoterms || "",
          partial_shipment: terms.partial_shipment || "",
          transhipment: terms.transhipment || "",
          amount_tolerance: terms.amount_tolerance || ""
        });
        
        // Extract confidences
        const confs: Record<string, number> = {};
        Object.keys(terms).forEach(key => {
          if (key.endsWith("_confidence")) {
            const fieldName = key.replace("_confidence", "");
            confs[fieldName] = terms[key];
          }
        });
        setLcConfidences(confs);
        
        addAuditLog(`Bóc tách L/C thành công. Chuyển sang Safety Gate để xác nhận điều khoản.`, "success");
        setScreen("safety_gate");
      }
    } catch (err: any) {
      console.error(err);
      setError("Không thể bóc tách file L/C. Vui lòng dán bức điện SWIFT thô hoặc điền tay.");
      addAuditLog("Bóc tách L/C thất bại.", "warning");
    } finally {
      setIsLCParsing(false);
    }
  };

  const handleStartAnalysis = async () => {
    // 1. Validate L/C input
    if (lcInputMode === "swift") {
      if (!swiftText.trim()) {
        setError("Vui lòng dán văn bản điện SWIFT MT700 vào ô Bước 1 trước.");
        return;
      }
    } else {
      if (!lcFile) {
        setError("Vui lòng tải lên tệp L/C (PDF, DOCX hoặc DOC) ở Bước 1 trước.");
        return;
      }
    }

    // 2. Collect commercial files
    const selectedCommercialFiles = [
      invoiceFile ? { file: invoiceFile, type: "INVOICE" } : null,
      blFile ? { file: blFile, type: "BILL_OF_LADING" } : null,
      plFile ? { file: plFile, type: "PACKING_LIST" } : null,
      coFile ? { file: coFile, type: "CO" } : null,
      cqFile ? { file: cqFile, type: "CQ" } : null,
      insuranceFile ? { file: insuranceFile, type: "INSURANCE" } : null
    ].filter(Boolean) as { file: File; type: string }[];

    if (selectedCommercialFiles.length === 0) {
      setError("Vui lòng tải lên ít nhất một tệp chứng từ thương mại.");
      return;
    }

    const commercialFiles = selectedCommercialFiles.map(x => x.file);
    const mapping: Record<string, string> = {};
    selectedCommercialFiles.forEach(x => { mapping[x.file.name] = x.type; });

    // 3. Navigate to result screen and start loading immediately
    setScreen("result");
    setIsLoading(true);
    setResult(null);
    setError(null);
    setExtractedDoc(null);
    setExtractedBl(null);
    setExtractedPl(null);
    setExtractedCo(null);
    setExtractedCq(null);
    setExtractedInsurance(null);
    setResultStep("ocr_check");
    setDiscrepancyList([]);
    setCrossDiscrepancies([]);
    setTerminalLogs([]);
    setFiles(commercialFiles);
    setFileTypesMap(mapping);

    const addTerminalLog = (msg: string) => {
      const t = new Date().toLocaleTimeString();
      setTerminalLogs(prev => [...prev, `[${t}] ${msg}`]);
    };

    addTerminalLog("Khởi tạo quy trình thẩm định...");
    addAuditLog("Khởi động quy trình thẩm định. Bước 1: Trích xuất điều khoản L/C...", "info");

    try {
      // 4. Extract L/C terms first
      let freshLcTerms = lcTerms;

      if (lcInputMode === "swift") {
        addTerminalLog("Giải mã điện SWIFT MT700...");
        const swiftResp = await axios.post(`${API_BASE}/api/v1/parse-swift`, { swift_text: swiftText });
        if (swiftResp.data.status === "success" && swiftResp.data.lc_terms) {
          const t = swiftResp.data.lc_terms;
          freshLcTerms = {
            max_amount: t.max_amount.toString(),
            currency: t.currency,
            latest_shipment: t.latest_shipment,
            beneficiary_name: t.beneficiary_name,
            port_of_loading: t.port_of_loading,
            applicant_name: t.applicant_name || "",
            expiry_date: t.expiry_date || "",
            port_of_discharge: t.port_of_discharge || "",
            goods_description: t.goods_description || "",
            incoterms: t.incoterms || "",
            partial_shipment: t.partial_shipment || "",
            transhipment: t.transhipment || "",
            amount_tolerance: t.amount_tolerance || ""
          };
          setLcTerms(freshLcTerms);
          const confs: Record<string, number> = {};
          Object.keys(t).forEach(k => { if (k.endsWith("_confidence")) confs[k.replace("_confidence", "")] = t[k]; });
          setLcConfidences(confs);
          addTerminalLog("Giải mã SWIFT MT700 thành công.");
          addAuditLog("Giải mã điện SWIFT MT700 thành công.", "success");
        } else {
          throw new Error("Không thể trích xuất điện SWIFT.");
        }
      } else {
        addTerminalLog(`Đang OCR file L/C: ${lcFile!.name}...`);
        const lcFormData = new FormData();
        lcFormData.append("file", lcFile!);
        const lcResp = await axios.post(`${API_BASE}/api/v1/extract-lc-file`, lcFormData);
        if (lcResp.data.status === "success" && lcResp.data.lc_terms) {
          const t = lcResp.data.lc_terms;
          freshLcTerms = {
            max_amount: t.max_amount.toString(),
            currency: t.currency,
            latest_shipment: t.latest_shipment,
            beneficiary_name: t.beneficiary_name,
            port_of_loading: t.port_of_loading,
            applicant_name: t.applicant_name || "",
            expiry_date: t.expiry_date || "",
            port_of_discharge: t.port_of_discharge || "",
            goods_description: t.goods_description || "",
            incoterms: t.incoterms || "",
            partial_shipment: t.partial_shipment || "",
            transhipment: t.transhipment || "",
            amount_tolerance: t.amount_tolerance || ""
          };
          setLcTerms(freshLcTerms);
          const confs: Record<string, number> = {};
          Object.keys(t).forEach(k => { if (k.endsWith("_confidence")) confs[k.replace("_confidence", "")] = t[k]; });
          setLcConfidences(confs);
          addTerminalLog("Bóc tách L/C thành công.");
          addAuditLog("Bóc tách điều khoản L/C thành công.", "success");
        } else {
          throw new Error("Không thể bóc tách file L/C.");
        }
      }

      // 5. Run commercial document check with fresh L/C terms
      addTerminalLog("Khởi tạo yêu cầu phân tích đa chứng từ...");
      const checkFormData = new FormData();
      commercialFiles.forEach(f => checkFormData.append("files", f));
      checkFormData.append("lc_rules", JSON.stringify(freshLcTerms));
      checkFormData.append("file_types", JSON.stringify(mapping));

      const checkResponse = await fetch(`${API_BASE}/api/v1/check-lc`, {
        method: "POST",
        body: checkFormData
      });

      if (!checkResponse.body) throw new Error("Không thể khởi tạo kết nối luồng.");

      const reader = checkResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resData: any = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            if (payload.type === "progress") {
              setLoadingStep(payload.msg);
              addTerminalLog(payload.msg);
            } else if (payload.type === "error") {
              setError(payload.msg);
              addTerminalLog(`[LỖI] ${payload.msg}`);
              setIsLoading(false);
              setLoadingStep("");
              return;
            } else if (payload.type === "result") {
              resData = payload.data;
              setResult(resData);
              setExtractedDoc(resData.extracted);
              setExtractedBl(resData.extracted_bl);
              setExtractedPl(resData.extracted_pl);
              setExtractedCo(resData.extracted_co);
              setExtractedCq(resData.extracted_cq);
              setExtractedInsurance(resData.extracted_insurance);
              setDiscrepancyList(resData.discrepancies || []);
              setLayer1Discrepancies(resData.layer1_discrepancies || []);
              setCrossDiscrepancies(resData.cross_discrepancies || []);
              setCannotWaive(resData.cannot_waive || false);
              if (resData.extracted?.invoice_number) setActiveOcrTab("invoice");
              else if (resData.extracted_bl) setActiveOcrTab("bl");
              else if (resData.extracted_pl) setActiveOcrTab("pl");
              else if (resData.extracted_co) setActiveOcrTab("co");
              else if (resData.extracted_cq) setActiveOcrTab("cq");
              else if (resData.extracted_insurance) setActiveOcrTab("insurance");
              addTerminalLog("AI Engine hoàn tất bóc tách và kiểm toán chéo.");
              addTerminalLog("Đối chiếu UCP 600 thành công.");
            }
          } catch { /* skip malformed chunk */ }
        }
      }

      addAuditLog("Hoàn tất bóc tách & kiểm toán chéo dữ liệu qua Multi-Agent", "success");
      if (resData) {
        const totalErrors = (resData.layer1_discrepancies?.length || 0) + (resData.discrepancies?.length || 0) + (resData.cross_discrepancies?.length || 0);
        if (totalErrors > 0) {
          addAuditLog(`Đối chiếu hoàn tất: Phát hiện ${totalErrors} bất hợp lệ.`, "warning");
        } else {
          addAuditLog("Đối chiếu hoàn tất: Các chứng từ hợp lệ toàn phần với L/C!", "success");
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Đã xảy ra lỗi kết nối với máy chủ API. Hãy đảm bảo Backend đang chạy tại port 8000.");
      addAuditLog("Quá trình xử lý lỗi: " + (err.message || "Lỗi kết nối API"), "warning");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
      setIsLCOverallParsing(false);
    }
  };

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const allowedExtensions = [".pdf", ".docx", ".doc"];
    const validFiles: File[] = [];
    const invalidFiles: File[] = [];

    acceptedFiles.forEach(file => {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (allowedExtensions.includes(ext)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      setError(`Không thể tải lên ${invalidFiles.length} tệp do định dạng không hỗ trợ (chỉ nhận PDF, DOCX, DOC).`);
      addAuditLog(`Có ${invalidFiles.length} tệp bị từ chối do định dạng không hỗ trợ.`, "warning");
    }

    if (validFiles.length > 0) {
      setFiles(prev => {
        const updated = [...prev, ...validFiles];
        addAuditLog(`Đã nhận ${validFiles.length} tệp chứng từ thương mại mới.`, "info");
        return updated;
      });
      if (invalidFiles.length === 0) {
        setError(null);
      }
    }
  }, [addAuditLog]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true
  });

  // Submit check request to FastAPI using Streaming Fetch Reader
  const handleCheck = async () => {
    if (files.length === 0) {
      setError("Vui lòng tải lên ít nhất một tệp PDF, DOCX hoặc DOC chứng từ cần đối chiếu.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setExtractedDoc(null);
    setExtractedBl(null);
    setExtractedPl(null);
    setExtractedCo(null);
    setExtractedCq(null);
    setExtractedInsurance(null);
    setResultStep("ocr_check");
    setDiscrepancyList([]);
    setCrossDiscrepancies([]);
    setTerminalLogs([]);

    const addTerminalLog = (msg: string) => {
      const t = new Date().toLocaleTimeString();
      setTerminalLogs(prev => [...prev, `[${t}] ${msg}`]);
    };

    try {
      const formData = new FormData();
      files.forEach(f => {
        formData.append("files", f);
      });
      formData.append("lc_rules", JSON.stringify(lcTerms));
      formData.append("file_types", JSON.stringify(fileTypesMap));

      addTerminalLog("Khởi tạo yêu cầu phân tích đa chứng từ...");

      // Call streaming API
      const response = await fetch(`${API_BASE}/api/v1/check-lc`, {
        method: "POST",
        body: formData
      });

      if (!response.body) {
        throw new Error("Không thể khởi tạo kết nối luồng (stream response).");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resData: any = null;  // Hoisted so accessible after stream ends

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            if (payload.type === "progress") {
              setLoadingStep(payload.msg);
              addTerminalLog(payload.msg);
            } else if (payload.type === "error") {
              setError(payload.msg);
              addTerminalLog(`[LỖI] ${payload.msg}`);
              setIsLoading(false);
              setLoadingStep("");
              return;  // Exit handleCheck early
            } else if (payload.type === "result") {
              resData = payload.data;
              setResult(resData);
              setExtractedDoc(resData.extracted);
              setExtractedBl(resData.extracted_bl);
              setExtractedPl(resData.extracted_pl);
              setExtractedCo(resData.extracted_co);
              setExtractedCq(resData.extracted_cq);
              setExtractedInsurance(resData.extracted_insurance);
              setDiscrepancyList(resData.discrepancies || []);
              setLayer1Discrepancies(resData.layer1_discrepancies || []);
              setCrossDiscrepancies(resData.cross_discrepancies || []);
              setCannotWaive(resData.cannot_waive || false);

              // Set default active tab
              if (resData.extracted && resData.extracted.invoice_number) {
                setActiveOcrTab("invoice");
              } else if (resData.extracted_bl) {
                setActiveOcrTab("bl");
              } else if (resData.extracted_pl) {
                setActiveOcrTab("pl");
              } else if (resData.extracted_co) {
                setActiveOcrTab("co");
              } else if (resData.extracted_cq) {
                setActiveOcrTab("cq");
              } else if (resData.extracted_insurance) {
                setActiveOcrTab("insurance");
              }
              addTerminalLog("AI Engine đã bóc tách dữ liệu và hoàn tất kiểm toán chéo.");
              addTerminalLog("Đối chiếu UCP 600 thành công.");
            }
          } catch (parseErr) {
            console.warn("Skipping malformed stream chunk:", parseErr);
          }
        }
      }

      addAuditLog("Hoàn tất bóc tách & kiểm toán chéo dữ liệu qua Multi-Agent (Agent 1 & Agent 2)", "success");

      if (resData) {
        const totalErrors = (resData.layer1_discrepancies?.length || 0) + (resData.discrepancies?.length || 0) + (resData.cross_discrepancies?.length || 0);
        if (totalErrors > 0) {
          addAuditLog(`Đối chiếu hoàn tất: Phát hiện ${totalErrors} bất hợp lệ (Nội bộ: ${resData.layer1_discrepancies?.length || 0}, L/C: ${resData.discrepancies?.length || 0}, Chéo: ${resData.cross_discrepancies?.length || 0}).`, "warning");
        } else {
          addAuditLog("Đối chiếu hoàn tất: Các chứng từ hợp lệ toàn phần với điều khoản L/C!", "success");
        }
      }

    } catch (err: any) {
      console.error(err);
      setError(
        err.message || 
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

  const [isRerunningValidation, setIsRerunningValidation] = useState(false);

  const handleRerunValidation = async () => {
    setIsRerunningValidation(true);
    addAuditLog("Bắt đầu đối chiếu dữ liệu L/C dựa trên thông tin OCR đã xác nhận...", "info");
    try {
      const payload = {
        lc_rules: lcTerms,
        extracted: extractedDoc,
        extracted_bl: extractedBl,
        extracted_pl: extractedPl,
        extracted_co: extractedCo,
        extracted_cq: extractedCq,
        extracted_insurance: extractedInsurance
      };
      
      const response = await axios.post(`${API_BASE}/api/v1/validate-documents`, payload);
      if (response.data.status === "success") {
        setDiscrepancyList(response.data.discrepancies || []);
        setLayer1Discrepancies(response.data.layer1_discrepancies || []);
        setCrossDiscrepancies(response.data.cross_discrepancies || []);
        setCannotWaive(response.data.cannot_waive || false);
        if (result) {
          setResult({
            ...result,
            waiver_draft: response.data.waiver_draft
          });
        }
        
        const totalErrors = (response.data.layer1_discrepancies?.length || 0) + 
                            (response.data.discrepancies?.length || 0) + 
                            (response.data.cross_discrepancies?.length || 0);
        if (totalErrors > 0) {
          addAuditLog(`Đối chiếu hoàn tất: Phát hiện ${totalErrors} bất hợp lệ (HITL 2).`, "warning");
        } else {
          addAuditLog("Đối chiếu hoàn tất: Các chứng từ hợp lệ toàn phần với điều khoản L/C! (HITL 2)", "success");
        }

        setResultStep("compliance_check");
      }
    } catch (err: any) {
      console.error(err);
      alert("Không thể chạy đối chiếu chéo. Vui lòng kiểm tra kết nối API.");
      addAuditLog("Lỗi chạy đối chiếu chéo.", "warning");
    } finally {
      setIsRerunningValidation(false);
    }
  };

  const startEditingField = (doc: "invoice" | "bl" | "pl" | "co" | "cq" | "insurance", field: string) => {
    setEditingDoc(doc);
    setEditingField(field);
    
    let currentVal = "";
    if (doc === "invoice" && extractedDoc) currentVal = (extractedDoc as any)[field]?.toString() || "";
    else if (doc === "bl" && extractedBl) currentVal = extractedBl[field]?.toString() || "";
    else if (doc === "pl" && extractedPl) currentVal = extractedPl[field]?.toString() || "";
    else if (doc === "co" && extractedCo) currentVal = extractedCo[field]?.toString() || "";
    else if (doc === "cq" && extractedCq) currentVal = extractedCq[field]?.toString() || "";
    else if (doc === "insurance" && extractedInsurance) currentVal = extractedInsurance[field]?.toString() || "";
    
    setEditValue(currentVal);
  };

  const saveEditingField = () => {
    if (!editingDoc || !editingField) return;
    
    let updatedVal: any = editValue;
    
    if (editingDoc === "invoice" && extractedDoc) {
      if (editingField === "total_amount" || editingField === "quantity" || editingField === "unit_price") {
        updatedVal = parseFloat(editValue) || 0;
      }
      const updated = {
        ...extractedDoc,
        [editingField]: updatedVal,
        [`${editingField}_confidence`]: 1.0
      };
      setExtractedDoc(updated);
      addAuditLog(`Chuyên viên hiệu chỉnh Hóa đơn: ${editingField} -> '${updatedVal}'`, "edit");
    } 
    else if (editingDoc === "bl" && extractedBl) {
      const updated = {
        ...extractedBl,
        [editingField]: updatedVal,
        [`${editingField}_confidence`]: 1.0
      };
      setExtractedBl(updated);
      addAuditLog(`Chuyên viên hiệu chỉnh B/L: ${editingField} -> '${updatedVal}'`, "edit");
    }
    else if (editingDoc === "pl" && extractedPl) {
      if (editingField === "quantity" || editingField === "packages_count") {
        updatedVal = parseFloat(editValue) || 0;
      }
      const updated = {
        ...extractedPl,
        [editingField]: updatedVal,
        [`${editingField}_confidence`]: 1.0
      };
      setExtractedPl(updated);
      addAuditLog(`Chuyên viên hiệu chỉnh Packing List: ${editingField} -> '${updatedVal}'`, "edit");
    }
    else if (editingDoc === "co" && extractedCo) {
      const updated = {
        ...extractedCo,
        [editingField]: updatedVal,
        [`${editingField}_confidence`]: 1.0
      };
      setExtractedCo(updated);
      addAuditLog(`Chuyên viên hiệu chỉnh C/O: ${editingField} -> '${updatedVal}'`, "edit");
    }
    else if (editingDoc === "cq" && extractedCq) {
      const updated = {
        ...extractedCq,
        [editingField]: updatedVal,
        [`${editingField}_confidence`]: 1.0
      };
      setExtractedCq(updated);
      addAuditLog(`Chuyên viên hiệu chỉnh C/Q: ${editingField} -> '${updatedVal}'`, "edit");
    }
    else if (editingDoc === "insurance" && extractedInsurance) {
      const updated = {
        ...extractedInsurance,
        [editingField]: updatedVal,
        [`${editingField}_confidence`]: 1.0
      };
      setExtractedInsurance(updated);
      addAuditLog(`Chuyên viên hiệu chỉnh Chứng thư bảo hiểm: ${editingField} -> '${updatedVal}'`, "edit");
    }
    
    setEditingDoc(null);
    setEditingField(null);
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
    // IMPORTANT: Use ?? not || to avoid treating 0.0 confidence as falsy
    // confidence=0.0 means AI did not see the field — we MUST show 0% not 100%
    const confidence = (extractedDoc[`${fieldName}_confidence` as keyof ExtractedDoc] as number) ?? 0.0;
    
    if (disc) {
      return {
        isValid: false,
        actual: extractedDoc[fieldName as keyof ExtractedDoc]?.toString() + (fieldName === "total_amount" ? ` ${extractedDoc.currency}` : ""),
        expected: disc.expected_value,
        reason: disc.reason,
        severity: disc.severity,
        quote: extractedDoc[`${fieldName}_quote` as keyof ExtractedDoc] || "",
        confidence
      };
    }
    
    let actualValue = "";
    let expectedValue = "";
    if (fieldName === "invoice_number") {
      actualValue = extractedDoc.invoice_number;
      expectedValue = "Tùy ý / Có hợp lệ";
    } else if (fieldName === "total_amount") {
      actualValue = `${extractedDoc.total_amount.toLocaleString()} ${extractedDoc.currency}`;
      
      const maxAmt = parseFloat(lcTerms.max_amount);
      const amountTolStr = (lcTerms.amount_tolerance || "").trim().toLowerCase();
      let positiveTol = 5.0;
      if (amountTolStr === "0" || amountTolStr.includes("exactly")) {
        positiveTol = 0.0;
      } else if (amountTolStr.includes("/")) {
        const parts = amountTolStr.split("/");
        const p1 = parseFloat(parts[0].replace("%", "").trim());
        if (!isNaN(p1)) positiveTol = p1;
      } else if (amountTolStr) {
        const val = parseFloat(amountTolStr.replace("%", "").trim());
        if (!isNaN(val)) positiveTol = val;
      }
      const maxAllowed = maxAmt * (1 + positiveTol / 100);
      expectedValue = `<= ${maxAllowed.toLocaleString()} ${lcTerms.currency} (Hạn mức ${maxAmt.toLocaleString()} + ${positiveTol}% dung sai)`;
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
    } else if (fieldName === "applicant_name") {
      actualValue = extractedDoc.applicant_name;
      expectedValue = lcTerms.applicant_name;
    } else if (fieldName === "port_of_discharge") {
      actualValue = extractedDoc.port_of_discharge;
      expectedValue = lcTerms.port_of_discharge;
    } else if (fieldName === "incoterms") {
      actualValue = extractedDoc.incoterms;
      expectedValue = lcTerms.incoterms;
    } else if (fieldName === "goods_description") {
      actualValue = extractedDoc.goods_description;
      expectedValue = lcTerms.goods_description;
    }

    return {
      isValid: true,
      actual: actualValue,
      expected: expectedValue,
      reason: "Hoàn toàn trùng khớp và hợp lệ",
      quote: extractedDoc[`${fieldName}_quote` as keyof ExtractedDoc] || "",
      confidence
    };
  };

  // Main Application Multi-Screen Flow Layout
  if (screen === "login") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans p-6 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl"></div>

        <div className="bg-slate-950/60 border border-slate-800 backdrop-blur-xl w-full max-w-md rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xl mb-4">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">LC-Vision Enterprise</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-xs leading-normal">
              Hệ thống thẩm định & Đối chiếu chứng từ L/C tự động tích hợp Multi-Agent AI
            </p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (username === "admin" && password === "admin") {
              addAuditLog("Chuyên viên đăng nhập thành công vào hệ thống.", "success");
              setScreen("dashboard");
              setLoginError("");
            } else {
              setLoginError("Tên đăng nhập hoặc mật khẩu không chính xác.");
            }
          }} className="space-y-5">
            <div>
              <label className="text-xs text-slate-400 font-bold mb-1.5 block">Tài khoản chuyên viên</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-all font-mono"
                placeholder="Nhập tài khoản"
                required
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold mb-1.5 block">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-all font-mono"
                placeholder="Nhập mật khẩu"
                required
              />
            </div>

            {loginError && (
              <p className="text-xs text-rose-500 font-semibold text-center">{loginError}</p>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/20"
            >
              Đăng nhập hệ thống
            </button>
          </form>

          <p className="text-[10px] text-slate-500 text-center mt-6">
            Bản quyền thuộc về LC-Vision Hackathon Team — MSB 2026.
          </p>
        </div>
      </div>
    );
  }

  if (screen === "dashboard") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
        <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent">
                  LC-Vision
                </h1>
                <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
                <User className="h-3.5 w-3.5 text-blue-200" />
                <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
              </div>
              <button
                onClick={() => setScreen("login")}
                className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Bảng điều khiển (Dashboard)</h2>
              <p className="text-xs text-slate-500 mt-1">Quản lý và thực hiện kiểm tra chéo, thẩm định chứng từ L/C</p>
            </div>
            <button
              onClick={() => {
                setScreen("upload");
                setFiles([]);
                setLcFile(null);
                setResult(null);
                setExtractedDoc(null);
                setExtractedBl(null);
                setExtractedPl(null);
                setDiscrepancyList([]);
                setCrossDiscrepancies([]);
                setDecisionStatus("idle");
                addAuditLog("Khởi tạo phiên làm việc mới.", "info");
              }}
              className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
            >
              <Upload className="h-4 w-4" />
              <span>+ Tạo kiểm tra mới</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 uppercase tracking-wider">Danh sách bộ chứng từ gần đây</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400 font-bold uppercase">
                    <th className="pb-3">Mã Case</th>
                    <th className="pb-3">Tên bộ chứng từ</th>
                    <th className="pb-3">Ngày tạo</th>
                    <th className="pb-3">Trạng thái</th>
                    <th className="pb-3">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {dashboardCases.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 font-mono font-bold text-blue-700 text-xs">{c.id}</td>
                      <td className="py-4 font-bold text-slate-700">{c.name}</td>
                      <td className="py-4 text-slate-400 font-semibold">{c.date}</td>
                      <td className="py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          c.status === "Compliant" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                          c.status === "Closed" ? "bg-rose-50 text-rose-700 border border-rose-100" : "bg-slate-100 text-slate-600"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="text-xs text-slate-500 font-bold">{c.conclusion}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (screen === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
        <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent cursor-pointer" onClick={() => setScreen("dashboard")}>
                  LC-Vision
                </h1>
                <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
                <User className="h-3.5 w-3.5 text-blue-200" />
                <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
              </div>
              <button
                onClick={() => setScreen("login")}
                className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 mt-8">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-6">
            <span className="hover:text-blue-700 cursor-pointer" onClick={() => setScreen("dashboard")}>Dashboard</span>
            <span>&gt;</span>
            <span className="text-slate-700">Tạo kiểm tra mới</span>
          </div>

          <div className="space-y-6">
            {/* All 6 document cards — equal level */}
            <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
                <Upload className="text-blue-700 h-5 w-5" />
                <div>
                  <h2 className="text-md font-bold text-blue-900">Tải lên bộ chứng từ</h2>
                  <p className="text-[11px] text-slate-400">Mỗi loại chứng từ có thể upload hoặc bỏ qua — cần ít nhất L/C và 1 chứng từ thương mại</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Card 01: L/C */}
                <div className={`border-2 rounded-2xl p-4 bg-white transition-all flex flex-col justify-between min-h-[150px] ${
                  (lcFile || swiftText.trim()) ? "border-emerald-200 bg-emerald-50/20 shadow-sm" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                }`}>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 h-6 w-6 rounded-lg bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">01</span>
                      <div>
                        <span className="text-sm font-bold text-slate-800 block leading-tight">Thư tín dụng (L/C)</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">Letter of Credit — tài liệu gốc ngân hàng phát hành</span>
                      </div>
                    </div>
                    {(lcFile || swiftText.trim()) && (
                      <button
                        type="button"
                        onClick={() => { setLcFile(null); setSwiftText(""); setLcInputMode("form"); addAuditLog("Đã xóa file/điện L/C", "info"); }}
                        className="text-rose-500 hover:text-rose-700 transition-colors p-0.5 shrink-0"
                        title="Xóa"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Same bottom area structure as renderUploadSlot */}
                  {lcFile ? (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-800">
                      <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="truncate font-semibold flex-1" title={lcFile.name}>{lcFile.name}</span>
                      <span className="text-emerald-600 font-mono text-[10px] shrink-0">{(lcFile.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ) : swiftText.trim() && lcInputMode === "swift" ? (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-800">
                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="truncate font-semibold flex-1">Điện SWIFT MT700 đã nhập ({swiftText.trim().length} ký tự)</span>
                    </div>
                  ) : lcInputMode === "swift" ? (
                    <div className="relative rounded-xl overflow-hidden">
                      <textarea
                        rows={3}
                        value={swiftText}
                        onChange={(e) => setSwiftText(e.target.value)}
                        placeholder=":32B: USD 50000&#10;:50: IMPORT CO LTD&#10;:59: GLOBAL TRADING CORP"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px] font-mono text-slate-800 focus:outline-none focus:border-blue-400 transition-all resize-none leading-relaxed"
                      />
                      <button
                        type="button"
                        onClick={() => { setSwiftText(""); setLcInputMode("form"); }}
                        className="absolute bottom-2 right-2 text-[9px] text-slate-400 hover:text-blue-600 font-semibold transition-colors bg-slate-50 px-1"
                      >
                        ← Dùng file PDF
                      </button>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl p-3 bg-slate-50 text-center cursor-pointer transition-all group">
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) { setLcFile(f); setLcInputMode("form"); setError(null); addAuditLog(`Đã chọn file L/C: ${f.name}`, "info"); }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        id="lc-file-upload"
                      />
                      <div className="flex flex-col items-center gap-1.5 text-slate-400 group-hover:text-blue-600 transition-colors">
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4 shrink-0" />
                          <span className="text-xs font-bold">Chọn tệp PDF / DOCX / DOC</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLcInputMode("swift"); }}
                          className="text-[9px] text-blue-500 hover:text-blue-700 font-semibold transition-colors pointer-events-auto"
                        >
                          hoặc dán điện SWIFT MT700 →
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {renderUploadSlot(
                  "Hóa đơn thương mại",
                  invoiceFile,
                  setInvoiceFile,
                  "invoice-upload",
                  "Invoice — hóa đơn bán hàng / thanh toán chính thức",
                  2
                )}
                {renderUploadSlot(
                  "Vận đơn đường biển",
                  blFile,
                  setBlFile,
                  "bl-upload",
                  "Bill of Lading — chứng từ nhận hàng & vận tải biển",
                  3
                )}
                {renderUploadSlot(
                  "Phiếu đóng gói",
                  plFile,
                  setPlFile,
                  "pl-upload",
                  "Packing List — danh mục kích thước & khối lượng",
                  4
                )}
                {renderUploadSlot(
                  "Chứng nhận xuất xứ",
                  coFile,
                  setCoFile,
                  "co-upload",
                  "C/O — giấy xác nhận nguồn gốc quốc gia sản xuất",
                  5
                )}
                {renderUploadSlot(
                  "Chứng thư bảo hiểm",
                  insuranceFile,
                  setInsuranceFile,
                  "insurance-upload",
                  "Insurance Certificate — bảo hiểm hàng hóa vận tải quốc tế",
                  6
                )}
              </div>
            </section>

            {/* Error & Submit */}
            <div className="space-y-4">
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex gap-2.5 items-start">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleStartAnalysis}
                disabled={isLCOverallParsing}
                className="w-full py-4 rounded-xl bg-blue-950 hover:bg-blue-900 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 disabled:opacity-50"
              >
                {isLCOverallParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <span>Bắt đầu OCR &amp; Kiểm tra chứng từ →</span>
                )}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (screen === "safety_gate") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
        <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent cursor-pointer" onClick={() => setScreen("dashboard")}>
                  LC-Vision
                </h1>
                <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
                <User className="h-3.5 w-3.5 text-blue-200" />
                <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
              </div>
              <button
                onClick={() => setScreen("login")}
                className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 mt-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-md">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Bước 3B: Xác nhận Điều khoản L/C (Safety Gate)</h2>
                <p className="text-xs text-slate-500 mt-0.5">Vui lòng rà soát lại thông tin tham chiếu L/C do AI tự động bóc tách trước khi chạy đối chiếu.</p>
              </div>
            </div>

            {/* Expiry Check Warning Block */}
            {(() => {
              const expDateStr = lcTerms.expiry_date;
              const isExpired = expDateStr ? new Date(expDateStr) < new Date("2026-06-26") : false;
              if (isExpired) {
                return (
                  <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-3 items-start animate-pulse">
                    <XCircle className="h-6 w-6 text-rose-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm">L/C ĐÃ HẾT HẠN - KHÔNG THỂ TIẾP TỤC</h4>
                      <p className="mt-1 leading-normal">
                        Hạn hết hạn của L/C là <strong>{expDateStr}</strong>, trước thời điểm xử lý chứng từ hiện tại (2026-06-26).
                        Quy trình thẩm định bị chặn đứng hoàn toàn do L/C đã quá hạn hiệu lực và không được phép Waiver theo điều lệ UCP 600.
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Table of terms */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Tên bên thụ hưởng (Beneficiary)", field: "beneficiary_name", value: lcTerms.beneficiary_name },
                  { label: "Tên người mua (Applicant)", field: "applicant_name", value: lcTerms.applicant_name },
                  { label: "Hạn mức L/C tối đa", field: "max_amount", value: `${parseFloat(lcTerms.max_amount).toLocaleString()} ${lcTerms.currency}` },
                  { label: "Dung sai số tiền (Tolerance)", field: "amount_tolerance", value: lcTerms.amount_tolerance || "5/5" },
                  { label: "Cảng xếp hàng (Port of Loading)", field: "port_of_loading", value: lcTerms.port_of_loading },
                  { label: "Cảng dỡ hàng (Port of Discharge)", field: "port_of_discharge", value: lcTerms.port_of_discharge },
                  { label: "Thời hạn giao hàng (Latest Shipment)", field: "latest_shipment", value: lcTerms.latest_shipment },
                  { label: "Ngày hết hạn (Expiry Date)", field: "expiry_date", value: lcTerms.expiry_date },
                  { label: "Điều kiện giao hàng (Incoterms)", field: "incoterms", value: lcTerms.incoterms || "CIF" },
                  { label: "Mô tả hàng hóa (Goods Description)", field: "goods_description", value: lcTerms.goods_description }
                ].map(item => {
                  const conf = lcConfidences[item.field];
                  const isLowConfidence = conf !== undefined && conf < 0.8;
                  return (
                    <div key={item.field} className={`p-4 rounded-xl border transition-all ${
                      isLowConfidence ? "border-amber-200 bg-amber-50/30" : "border-slate-100 bg-slate-50/50"
                    }`}>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">{item.label}</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold text-slate-800">{item.value || "(Chưa có)"}</span>
                        
                        {isLowConfidence && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse shrink-0">
                            ⚠️ Cần kiểm tra kỹ ({Math.round(conf * 100)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setScreen("upload")}
                  className="px-6 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
                >
                  Quay lại
                </button>
                <button
                  onClick={() => {
                    setScreen("result");
                    handleCheck();
                  }}
                  disabled={(() => {
                    const expDateStr = lcTerms.expiry_date;
                    return expDateStr ? new Date(expDateStr) < new Date("2026-06-26") : false;
                  })()}
                  className="flex-1 py-3.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-center shadow-lg"
                >
                  Xác nhận & Bắt đầu kiểm tra chéo
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // screen === "result"
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* Navbar: Enterprise Bank Theme */}
      <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent cursor-pointer" onClick={() => setScreen("dashboard")}>
                LC-Vision
              </h1>
              <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
              <User className="h-3.5 w-3.5 text-blue-200" />
              <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
            </div>
            <button
              onClick={() => setScreen("login")}
              className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: Audit Trail + Back button */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white border border-blue-900/5 rounded-2xl p-4 shadow-sm">
            <button
              onClick={() => setScreen("upload")}
              className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
            >
              <Upload className="h-3.5 w-3.5" />
              Thay đổi bộ chứng từ
            </button>
          </div>

          {!isLoading && auditLogs.length > 0 && (
            <div className="bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Clock className="text-blue-700 h-5 w-5" />
                <h3 className="text-sm font-bold text-blue-900">Nhật ký vận hành (Audit Trail)</h3>
              </div>

              <div className="relative border-l-2 border-slate-200 pl-4 ml-2 space-y-4 max-h-96 overflow-y-auto">
                {auditLogs.map((log, index) => {
                  let dotColor = "bg-slate-300";
                  if (log.type === "success") dotColor = "bg-emerald-500";
                  if (log.type === "warning") dotColor = "bg-rose-500";
                  if (log.type === "edit") dotColor = "bg-blue-600";

                  return (
                    <div key={index} className="relative text-xs">
                      <span className={`absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${dotColor} shadow-sm`}></span>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-mono">{log.time}</span>
                        <p className="text-slate-700 font-medium mt-0.5">{log.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right column: Results & Sign Area */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Live Terminal logs panel */}
          {terminalLogs.length > 0 && (
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 pb-2 border-b border-slate-900/60">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span>Trình giám sát tác nhân AI (Live Console)</span>
              </div>
              <div className="bg-slate-950/80 font-mono text-[10px] text-emerald-400 p-3 rounded-xl border border-slate-900 shadow-inner h-36 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                {terminalLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed animate-[fadeIn_0.2s_ease-out]">
                    {log}
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}

          {/* Waiting/Processing State */}
          {isLoading && (
            <div className="bg-white border border-blue-900/5 rounded-2xl p-12 shadow-md flex flex-col items-center justify-center text-center min-h-[480px]">
              <Loader2 className="h-10 w-10 text-blue-700 animate-spin mb-6" />
              <h3 className="text-lg font-bold text-blue-900 mb-2">Đang phân tích bộ chứng từ</h3>
              <p className="text-sm text-slate-500 max-w-sm mb-6">
                Các Agent AI đang bóc tách nội dung PDF/DOCX/DOC bằng GPT-4o và thực hiện rà soát, kiểm toán độc lập.
              </p>
              
              <div className="w-64 bg-slate-100 rounded-full h-2 border border-slate-200 overflow-hidden relative">
                <div className="h-full bg-blue-900 rounded-full animate-[loading_2.5s_infinite] absolute"></div>
              </div>
              <p className="text-xs text-blue-700 font-bold font-mono mt-5">
                {loadingStep}
              </p>
            </div>
          )}

          {/* Results Render */}
          {!isLoading && extractedDoc && (
            <ResultsCard
              isLoading={isLoading}
              extractedDoc={extractedDoc}
              extractedBl={extractedBl}
              extractedPl={extractedPl}
              extractedCo={extractedCo}
              extractedCq={extractedCq}
              extractedInsurance={extractedInsurance}
              resultStep={resultStep}
              setResultStep={setResultStep}
              activeOcrTab={activeOcrTab}
              setActiveOcrTab={setActiveOcrTab}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              discrepancyList={discrepancyList}
              layer1Discrepancies={layer1Discrepancies}
              crossDiscrepancies={crossDiscrepancies}
              cannotWaive={cannotWaive}
              editingDoc={editingDoc}
              editingField={editingField}
              editValue={editValue}
              setEditValue={setEditValue}
              startEditingField={startEditingField}
              saveEditingField={saveEditingField}
              handleRerunValidation={handleRerunValidation}
              isRerunningValidation={isRerunningValidation}
              decisionStatus={decisionStatus}
              setDecisionStatus={setDecisionStatus}
              setIsRejectModalOpen={setIsRejectModalOpen}
              addAuditLog={addAuditLog}
              getFieldStatus={getFieldStatus}
              result={result}
              setResult={setResult}
            />
          )}

        </section>

      </main>

      {/* Next Action Area - Decisions (Appears after action selected) */}
      {!isLoading && extractedDoc && decisionStatus !== "idle" && (
        <section className="max-w-7xl mx-auto px-6 mt-8">
          {decisionStatus === "payout" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out] flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-md font-bold text-emerald-900">Hồ sơ đã được phê duyệt giải ngân</h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Bộ chứng từ tuân thủ (Compliant). Hệ thống đã tự động kích hoạt tiến trình giải ngân sang phòng nghiệp vụ thanh toán quốc tế.
                </p>
              </div>
            </div>
          )}

          {decisionStatus === "compliant_with_waiver" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out] flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-md font-bold text-emerald-900">Compliant with Waiver (Đã chấp thuận)</h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Khách hàng (Applicant) đã chính thức đồng ý chấp nhận bỏ qua các sai lệch chứng từ. Bộ hồ sơ chuyển trạng thái đủ điều kiện giải ngân.
                </p>
              </div>
            </div>
          )}

          {decisionStatus === "rejected" && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out] flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200 mt-0.5">
                <XCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-md font-bold text-rose-900">Từ chối thanh toán thành công (Closed — Rejected)</h3>
                <p className="text-sm text-rose-700 mt-1">
                  <strong>Lý do từ chối:</strong> {rejectReason}
                </p>
                <p className="text-xs text-rose-500 mt-2 font-mono">
                  Ghi chú: Lịch sử và lý do từ chối đã được lưu trữ an toàn trong Nhật ký vận hành hệ thống.
                </p>
              </div>
            </div>
          )}

          {decisionStatus === "pending_customer" && (
            <div className="bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out]">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Mail className="text-blue-700 h-5 w-5" />
                  <div>
                    <h3 className="text-lg font-bold text-blue-900">Nội dung email gửi khách hàng (Waiver Request)</h3>
                    <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mt-0.5">AI tự động soạn thảo — có thể chỉnh sửa trước khi gửi</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 md:mt-0">
                  <button
                    onClick={handleCopyEmail}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200"
                  >
                    {copied ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Đã sao chép!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Copy className="h-3.5 w-3.5" /> Sao chép
                      </span>
                    )}
                  </button>
                  <a
                    href={`mailto:?subject=Thong bao vuong mac chung tu L/C&body=${encodeURIComponent(result?.waiver_draft || "")}`}
                    className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Gửi Email</span>
                  </a>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 font-sans text-sm text-slate-700 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed border border-amber-100 border-l-4 border-l-amber-500">
                {result?.waiver_draft}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Rejection Reason Modal (BA v2.0 TO-BE) */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-rose-600"></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Từ chối thanh toán</h3>
            <p className="text-xs text-slate-500 mb-4">Vui lòng nhập lý lý do từ chối thanh toán bộ chứng từ này:</p>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nhập lý do từ chối cụ thể (ví dụ: Số tiền vượt hạn mức, Trễ hạn giao hàng)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:bg-white transition-all leading-normal mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  if (!rejectReason.trim()) {
                    alert("Vui lòng nhập lý do từ chối.");
                    return;
                  }
                  setDecisionStatus("rejected");
                  setIsRejectModalOpen(false);
                  addAuditLog(`Chuyên viên quyết định TỪ CHỐI THANH TOÁN. Lý do: ${rejectReason}`, "warning");
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Xác nhận từ chối
              </button>
            </div>
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

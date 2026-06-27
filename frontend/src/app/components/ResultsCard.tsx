import React, { useState } from "react";
import { AlertTriangle, CheckCircle, Check, Edit2, Loader2, Mail, XCircle, HelpCircle, Copy } from "lucide-react";
import { ExtractedDoc, Discrepancy } from "../page";

interface ResultsCardProps {
  isLoading: boolean;
  extractedDoc: ExtractedDoc;
  extractedBl: any;
  extractedPl: any;
  extractedCo: any;
  extractedCq: any;
  extractedInsurance: any;
  resultStep: "ocr_check" | "compliance_check";
  setResultStep: (step: "ocr_check" | "compliance_check") => void;
  activeOcrTab: "invoice" | "bl" | "pl" | "co" | "cq" | "insurance";
  setActiveOcrTab: (tab: "invoice" | "bl" | "pl" | "co" | "cq" | "insurance") => void;
  activeTab: "internal" | "cross" | "lc";
  setActiveTab: (tab: "internal" | "cross" | "lc") => void;
  discrepancyList: Discrepancy[];
  layer1Discrepancies: Discrepancy[];
  crossDiscrepancies: Discrepancy[];
  cannotWaive: boolean;
  editingDoc: "invoice" | "bl" | "pl" | "co" | "cq" | "insurance" | null;
  editingField: string | null;
  editValue: string;
  setEditValue: (val: string) => void;
  startEditingField: (doc: "invoice" | "bl" | "pl" | "co" | "cq" | "insurance", field: string) => void;
  saveEditingField: () => void;
  handleRerunValidation: () => Promise<void>;
  isRerunningValidation: boolean;
  decisionStatus: string;
  setDecisionStatus: (status: any) => void;
  setIsRejectModalOpen: (open: boolean) => void;
  addAuditLog: (msg: string, type: any) => void;
  getFieldStatus: (fieldName: string) => any;
  result: any;
  setResult: (res: any) => void;
}

export const ResultsCard: React.FC<ResultsCardProps> = (props) => {
  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = () => {
    if (props.result?.waiver_draft) {
      navigator.clipboard.writeText(props.result.waiver_draft);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  };
  return <ResultsCardInner {...props} emailCopied={emailCopied} handleCopyEmail={handleCopyEmail} />;
};

const ResultsCardInner: React.FC<ResultsCardProps & { emailCopied: boolean; handleCopyEmail: () => void }> = ({
  extractedDoc,
  extractedBl,
  extractedPl,
  extractedCo,
  extractedCq,
  extractedInsurance,
  resultStep,
  activeOcrTab,
  setActiveOcrTab,
  activeTab,
  setActiveTab,
  discrepancyList,
  layer1Discrepancies,
  crossDiscrepancies,
  cannotWaive,
  editingDoc,
  editingField,
  editValue,
  setEditValue,
  startEditingField,
  saveEditingField,
  handleRerunValidation,
  isRerunningValidation,
  setDecisionStatus,
  setIsRejectModalOpen,
  addAuditLog,
  getFieldStatus,
  result,
  setResult,
  emailCopied,
  handleCopyEmail
}) => {

  const renderOcrRow = (docType: "invoice" | "bl" | "pl" | "co" | "cq" | "insurance", label: string, fieldKey: string, type: string, options?: string[]) => {
    let docData: any = null;
    if (docType === "invoice") docData = extractedDoc;
    else if (docType === "bl") docData = extractedBl;
    else if (docType === "pl") docData = extractedPl;
    else if (docType === "co") docData = extractedCo;
    else if (docType === "cq") docData = extractedCq;
    else if (docType === "insurance") docData = extractedInsurance;

    if (!docData) return null;

    const val = docData[fieldKey];
    const confidence = docData[`${fieldKey}_confidence`] ?? 0.0;
    const quote = docData[`${fieldKey}_quote`] ?? "";

    const isEditing = editingDoc === docType && editingField === fieldKey;
    const isLowConfidence = confidence < 0.8;

    return (
      <tr key={fieldKey} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
        <td className="py-3.5 pl-4 font-semibold text-slate-700 text-xs w-[35%]">
          {label}
        </td>
        <td className="py-2.5 w-[65%]">
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              {type === "select" ? (
                <select
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="bg-white border border-blue-500 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none w-40 font-mono"
                  autoFocus
                >
                  {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type={type}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="bg-white border border-blue-500 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none w-full max-w-[280px] font-mono"
                  autoFocus
                />
              )}
              <button 
                onClick={saveEditingField}
                className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 shrink-0"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 group">
                <span className="font-mono text-xs font-semibold text-slate-800 break-all">
                  {type === "number" && typeof val === "number" ? val.toLocaleString() : val?.toString() || "(Trống)"}
                </span>
                
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                  isLowConfidence 
                    ? "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse" 
                    : "bg-blue-50 text-blue-700"
                }`}>
                  Tin cậy: {Math.round(confidence * 100)}%
                </span>

                {isLowConfidence && (
                  <div className="flex items-center gap-0.5 text-[8px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded-full border border-amber-200 shrink-0">
                    <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                    <span>Rà soát</span>
                  </div>
                )}

                <button 
                  onClick={() => startEditingField(docType, fieldKey)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-blue-700 shrink-0"
                  title="Click để sửa lỗi thủ công"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </div>
              
              {quote && (
                <div className="text-[10px] text-slate-400 italic max-w-md break-all leading-normal">
                  Trích dẫn gốc: "{quote}"
                </div>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md flex flex-col justify-between min-h-[560px]">
      {resultStep === "ocr_check" ? (
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-blue-900">HITL Bước 1: Kiểm tra kết quả OCR (OCR Check)</h2>
              <p className="text-xs text-slate-400">Rà soát và đính chính các trường thông tin bóc tách từ các chứng từ trước khi đối chiếu chéo.</p>
            </div>
          </div>

          <div className="flex border-b border-slate-100 mb-5 overflow-x-auto">
            {extractedDoc && extractedDoc.invoice_number !== "" && (
              <button
                onClick={() => setActiveOcrTab("invoice")}
                className={`pb-3 text-xs font-bold transition-all px-4 relative shrink-0 ${
                  activeOcrTab === "invoice" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Hóa đơn thương mại
              </button>
            )}
            {extractedBl && (
              <button
                onClick={() => setActiveOcrTab("bl")}
                className={`pb-3 text-xs font-bold transition-all px-4 relative shrink-0 ${
                  activeOcrTab === "bl" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Vận đơn (B/L)
              </button>
            )}
            {extractedPl && (
              <button
                onClick={() => setActiveOcrTab("pl")}
                className={`pb-3 text-xs font-bold transition-all px-4 relative shrink-0 ${
                  activeOcrTab === "pl" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Phiếu đóng gói (PL)
              </button>
            )}
            {extractedCo && (
              <button
                onClick={() => setActiveOcrTab("co")}
                className={`pb-3 text-xs font-bold transition-all px-4 relative shrink-0 ${
                  activeOcrTab === "co" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Chứng nhận xuất xứ (C/O)
              </button>
            )}
            {extractedCq && (
              <button
                onClick={() => setActiveOcrTab("cq")}
                className={`pb-3 text-xs font-bold transition-all px-4 relative shrink-0 ${
                  activeOcrTab === "cq" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Chứng nhận chất lượng (C/Q)
              </button>
            )}
            {extractedInsurance && (
              <button
                onClick={() => setActiveOcrTab("insurance")}
                className={`pb-3 text-xs font-bold transition-all px-4 relative shrink-0 ${
                  activeOcrTab === "insurance" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Chứng thư bảo hiểm
              </button>
            )}
          </div>

          <div className="mb-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5">
            <HelpCircle className="h-4.5 w-4.5 text-blue-700 shrink-0 mt-0.5" />
            <span>
              <strong>Hướng dẫn:</strong> Bấm nút bút chì ✏️ bên cạnh trường dữ liệu để thay đổi giá trị nếu AI bóc tách chưa chuẩn. Khi sửa xong bấm nút <Check className="h-3 w-3 inline text-emerald-600 font-bold" /> để lưu.
            </span>
          </div>

          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 font-bold pl-4">Trường thông tin</th>
                  <th className="pb-3 font-bold">Giá trị bóc tách (AI)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {activeOcrTab === "invoice" && [
                  { label: "Số hóa đơn (Invoice Number)", key: "invoice_number", type: "text" },
                  { label: "Ngày hóa đơn (Invoice Date)", key: "invoice_date", type: "text" },
                  { label: "Người bán (Beneficiary)", key: "beneficiary_name", type: "text" },
                  { label: "Địa chỉ người bán", key: "beneficiary_address", type: "text" },
                  { label: "Người mua (Applicant)", key: "applicant_name", type: "text" },
                  { label: "Địa chỉ người mua", key: "applicant_address", type: "text" },
                  { label: "Tổng số tiền (Total Amount)", key: "total_amount", type: "number" },
                  { label: "Đồng tiền (Currency)", key: "currency", type: "text" },
                  { label: "Số lượng (Quantity)", key: "quantity", type: "number" },
                  { label: "Đơn giá (Unit Price)", key: "unit_price", type: "number" },
                  { label: "Cảng xếp hàng", key: "port_of_loading", type: "text" },
                  { label: "Cảng dỡ hàng", key: "port_of_discharge", type: "text" },
                  { label: "Điều kiện Incoterms", key: "incoterms", type: "text" },
                  { label: "Mô tả hàng hóa", key: "goods_description", type: "text" },
                  { label: "Chữ ký/Con dấu người bán", key: "signature_present", type: "select", options: ["PRESENT", "MISSING"] }
                ].map(f => renderOcrRow("invoice", f.label, f.key, f.type, f.options))}

                {activeOcrTab === "bl" && [
                  { label: "Người gửi hàng (Shipper)", key: "shipper_name", type: "text" },
                  { label: "Người nhận hàng (Consignee)", key: "consignee_name", type: "text" },
                  { label: "Bên thông báo (Notify Party)", key: "notify_party", type: "text" },
                  { label: "Cảng bốc hàng", key: "port_of_loading", type: "text" },
                  { label: "Cảng dỡ hàng", key: "port_of_discharge", type: "text" },
                  { label: "Ngày xếp hàng (On Board Date)", key: "on_board_date", type: "text" },
                  { label: "Ngày phát hành B/L (B/L Date)", key: "bl_date", type: "text" },
                  { label: "Tên tàu & Số chuyến", key: "vessel_name_voyage", type: "text" },
                  { label: "Mô tả hàng hóa", key: "goods_description", type: "text" },
                  { label: "Số lượng / Trọng lượng", key: "quantity", type: "text" },
                  { label: "Điều khoản Clean on Board", key: "clean_on_board_clause", type: "text" },
                  { label: "Số bản B/L gốc", key: "original_copies_count", type: "text" },
                  { label: "Chữ ký của hãng tàu", key: "signature_present", type: "select", options: ["PRESENT", "MISSING"] }
                ].map(f => renderOcrRow("bl", f.label, f.key, f.type, f.options))}

                {activeOcrTab === "pl" && [
                  { label: "Tên hàng hóa", key: "goods_name", type: "text" },
                  { label: "Số lượng", key: "quantity", type: "number" },
                  { label: "Trọng lượng tịnh (Net Weight)", key: "net_weight", type: "text" },
                  { label: "Trọng lượng cả bao bì (Gross)", key: "gross_weight", type: "text" },
                  { label: "Số kiện/thùng đóng gói", key: "packages_count", type: "number" }
                ].map(f => renderOcrRow("pl", f.label, f.key, f.type))}

                {activeOcrTab === "co" && [
                  { label: "Số chứng nhận C/O (C/O No.)", key: "co_number", type: "text" },
                  { label: "Ngày phát hành C/O", key: "co_date", type: "text" },
                  { label: "Nước xuất xứ (Origin Country)", key: "country_of_origin", type: "text" },
                  { label: "Số hóa đơn tham chiếu", key: "invoice_number", type: "text" },
                  { label: "Người giao hàng (Shipper)", key: "shipper_name", type: "text" },
                  { label: "Người nhận hàng (Consignee)", key: "consignee_name", type: "text" },
                  { label: "Mô tả hàng hóa", key: "goods_description", type: "text" },
                  { label: "Chữ ký & Đóng dấu phòng thương mại", key: "signature_present", type: "select", options: ["PRESENT", "MISSING"] }
                ].map(f => renderOcrRow("co", f.label, f.key, f.type, f.options))}

                {activeOcrTab === "cq" && [
                  { label: "Số chứng nhận C/Q (C/Q No.)", key: "cq_number", type: "text" },
                  { label: "Ngày phát hành C/Q", key: "cq_date", type: "text" },
                  { label: "Số hóa đơn tham chiếu", key: "invoice_number", type: "text" },
                  { label: "Mô tả hàng hóa", key: "goods_description", type: "text" },
                  { label: "Cam kết chất lượng (Quality statement)", key: "quality_statement", type: "text" },
                  { label: "Chữ ký & Đóng dấu kiểm định", key: "signature_present", type: "select", options: ["PRESENT", "MISSING"] }
                ].map(f => renderOcrRow("cq", f.label, f.key, f.type, f.options))}

                {activeOcrTab === "insurance" && [
                  { label: "Số chứng thư bảo hiểm (Policy/Cert No.)", key: "insurance_number", type: "text" },
                  { label: "Ngày phát hành bảo hiểm", key: "insurance_date", type: "text" },
                  { label: "Số tiền bảo hiểm (Insured Amount)", key: "insured_amount", type: "text" },
                  { label: "Đơn vị tiền tệ (Currency)", key: "currency", type: "text" },
                  { label: "Bên được bảo hiểm (Insured Name)", key: "insured_name", type: "text" },
                  { label: "Số hóa đơn tham chiếu", key: "invoice_number", type: "text" },
                  { label: "Chữ ký nhà bảo hiểm/đại lý", key: "signature_present", type: "select", options: ["PRESENT", "MISSING"] }
                ].map(f => renderOcrRow("insurance", f.label, f.key, f.type, f.options))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleRerunValidation}
              disabled={isRerunningValidation}
              className="px-6 py-3.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-sm transition-colors flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isRerunningValidation ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang kiểm tra...</span>
                </>
              ) : (
                <>
                  <span>Kiểm tra bộ chứng từ</span>
                  <span>➔</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Stage 2 View: compliance checks */
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-blue-900">HITL Bước 2: Báo cáo đối chiếu (Compliance Report)</h2>
              <p className="text-xs text-slate-400">Danh sách các điểm sai biệt phân loại theo UCP 600. Đưa ra quyết định phê duyệt/từ chối thanh toán.</p>
            </div>
            <div className={`px-3.5 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
              (discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length) > 0
                ? "bg-rose-50 border-rose-100 text-rose-700"
                : "bg-emerald-50 border-emerald-100 text-emerald-700"
            }`}>
              {(discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length) > 0 ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Phát hiện {discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length} sai biệt</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Chứng từ tuân thủ tuyệt đối</span>
                </>
              )}
            </div>
          </div>

          <div className="flex border-b border-slate-100 mb-5 overflow-x-auto">
            <button
              onClick={() => setActiveTab("internal")}
              className={`pb-3 text-xs font-bold transition-all px-4 shrink-0 relative ${
                activeTab === "internal" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Kiểm tra nội bộ
              {layer1Discrepancies.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-rose-600 text-white rounded-full text-[9px] font-bold">
                  {layer1Discrepancies.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("cross")}
              className={`pb-3 text-xs font-bold transition-all px-4 shrink-0 relative ${
                activeTab === "cross" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Kiểm tra chéo chứng từ
              {crossDiscrepancies.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-rose-600 text-white rounded-full text-[9px] font-bold">
                  {crossDiscrepancies.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("lc")}
              className={`pb-3 text-xs font-bold transition-all px-4 shrink-0 relative ${
                activeTab === "lc" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Kiểm tra theo luật quốc tế
              {discrepancyList.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-rose-600 text-white rounded-full text-[9px] font-bold">
                  {discrepancyList.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === "lc" ? (
            <div className="space-y-3">
              {["beneficiary_name", "applicant_name", "total_amount", "currency", "shipment_date", "port_of_loading", "port_of_discharge", "incoterms", "goods_description"].map(field => {
                const status = getFieldStatus(field);
                if (!status) return null;

                const labels: Record<string, string> = {
                  beneficiary_name: "Người thụ hưởng",
                  applicant_name: "Người mua (Applicant)",
                  total_amount: "Tổng số tiền",
                  currency: "Đồng tiền",
                  shipment_date: "Ngày giao hàng",
                  port_of_loading: "Cảng bốc hàng",
                  port_of_discharge: "Cảng dỡ hàng",
                  incoterms: "Incoterms",
                  goods_description: "Mô tả hàng hóa"
                };

                const isWarn = !status.isValid && status.severity === "Warning";
                const isError = !status.isValid && status.severity !== "Warning";

                return (
                  <div key={field} className={`rounded-xl border p-4 transition-colors ${
                    status.isValid
                      ? "bg-emerald-50/30 border-emerald-100"
                      : isWarn
                        ? "bg-amber-50/30 border-amber-200"
                        : "bg-rose-50/20 border-rose-200"
                  }`}>
                    {/* Header: field name + status icon */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-slate-800">{labels[field]}</span>
                      {status.isValid ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2.5 py-1">
                          <CheckCircle className="h-3.5 w-3.5" /> Khớp
                        </span>
                      ) : isWarn ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
                          <AlertTriangle className="h-3.5 w-3.5" /> Cảnh báo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-100 border border-rose-200 rounded-full px-2.5 py-1">
                          <XCircle className="h-3.5 w-3.5" /> Không khớp
                        </span>
                      )}
                    </div>

                    {/* Comparison: L/C requirement vs actual */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">Yêu cầu L/C</div>
                        <div className="text-xs text-slate-600 bg-white/80 rounded-lg px-3 py-2 border border-slate-100 leading-relaxed min-h-9">
                          {status.expected}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">Chứng từ thực tế</div>
                        <div className={`text-xs rounded-lg px-3 py-2 border leading-relaxed min-h-9 font-semibold ${
                          status.isValid
                            ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                            : isWarn
                              ? "bg-amber-50 text-amber-800 border-amber-100"
                              : "bg-rose-50 text-rose-800 border-rose-100"
                        }`}>
                          {status.actual}
                        </div>
                      </div>
                    </div>

                    {/* Error reason */}
                    {!status.isValid && status.reason && (
                      <div className={`mt-2.5 flex items-start gap-2 text-xs font-semibold rounded-lg px-3 py-2 ${
                        isWarn ? "text-amber-800 bg-amber-50/60" : "text-rose-700 bg-rose-50/60"
                      }`}>
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{status.reason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : activeTab === "cross" ? (
            <div className="space-y-4">
              {crossDiscrepancies.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-emerald-600 mb-3" />
                  <h4 className="text-sm font-bold text-emerald-900">Nhất quán toàn bộ dữ liệu</h4>
                  <p className="text-xs text-emerald-700 mt-1 max-w-sm">
                    Không phát hiện sai biệt chéo (Layer 2) giữa các chứng từ (Hóa đơn, B/L, Packing List, C/O, C/Q).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {crossDiscrepancies.map((disc, idx) => (
                    <div key={idx} className="bg-rose-50/20 border border-rose-100/60 p-4 rounded-xl flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                          {disc.field === "cross_beneficiary_shipper" ? "Beneficiary ↔ Shipper" :
                           disc.field === "cross_goods_invoice_bl" ? "Mô tả hàng (Invoice ↔ B/L)" :
                           disc.field === "cross_goods_invoice_pl" ? "Mô tả hàng (Invoice ↔ PL)" :
                           disc.field === "cross_loading_port" ? "Cảng bốc hàng" :
                           disc.field === "cross_discharge_port" ? "Cảng dỡ hàng" :
                           disc.field.startsWith("cross_co_") ? `Chứng nhận xuất xứ (C/O)` :
                           disc.field.startsWith("cross_cq_") ? `Chứng nhận chất lượng (C/Q)` : "Sai biệt"}
                        </span>
                        <span className="bg-rose-100 text-rose-700 text-[9px] px-2 py-0.5 rounded font-bold uppercase">{disc.severity}</span>
                      </div>
                      <p className="text-xs text-rose-950 font-semibold">{disc.reason}</p>
                      <div className="grid grid-cols-2 gap-4 mt-1 bg-white p-3 rounded-lg border border-slate-100 text-xs font-mono">
                        <div>
                          <div className="text-slate-400 text-[8px] uppercase font-bold">Giá trị thực tế</div>
                          <div className="text-rose-700 font-bold mt-0.5 break-all">{disc.actual_value}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[8px] uppercase font-bold">Giá trị đối chiếu</div>
                          <div className="text-slate-700 font-bold mt-0.5 break-all">{disc.expected_value}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {layer1Discrepancies.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-emerald-600 mb-3" />
                  <h4 className="text-sm font-bold text-emerald-900">Chứng từ hoàn toàn hợp lệ nội bộ</h4>
                  <p className="text-xs text-emerald-700 mt-1 max-w-sm">
                    Tất cả chứng từ đáp ứng đầy đủ các kiểm tra cấu trúc nội bộ (Layer 1).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {layer1Discrepancies.map((disc, idx) => (
                    <div key={idx} className={`border p-4 rounded-xl flex flex-col gap-2 ${
                      disc.severity === "Warning" ? "bg-amber-50/20 border-amber-100/60" : "bg-rose-50/20 border-rose-100/60"
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-bold uppercase tracking-wider ${
                          disc.severity === "Warning" ? "text-amber-800" : "text-rose-800"
                        }`}>
                          {disc.field === "co_number" ? "C/O Number" :
                           disc.field === "co_date" ? "C/O Date" :
                           disc.field === "co_origin" ? "C/O Origin" :
                           disc.field === "co_signature" ? "C/O Signature" :
                           disc.field === "cq_number" ? "C/Q Number" :
                           disc.field === "cq_date" ? "C/Q Date" :
                           disc.field === "cq_statement" ? "C/Q Quality Statement" :
                           disc.field === "cq_signature" ? "C/Q Signature" : disc.field}
                        </span>
                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                          disc.severity === "Warning" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                        }`}>{disc.severity}</span>
                      </div>
                      <p className={`text-xs font-semibold ${
                        disc.severity === "Warning" ? "text-amber-950" : "text-rose-950"
                      }`}>{disc.reason}</p>
                      <div className="grid grid-cols-2 gap-4 mt-1 bg-white p-3 rounded-lg border border-slate-100 text-xs font-mono">
                        <div>
                          <div className="text-slate-400 text-[8px] uppercase font-bold">Thực tế bóc tách</div>
                          <div className={`font-bold mt-0.5 break-all ${
                            disc.severity === "Warning" ? "text-amber-700" : "text-rose-700"
                          }`}>{disc.actual_value}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-[8px] uppercase font-bold">Tiêu chuẩn nghiệp vụ</div>
                          <div className="text-slate-700 font-bold mt-0.5 break-all">{disc.expected_value}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {cannotWaive && (
            <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-3 items-start">
              <XCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-extrabold text-sm uppercase">L/C QUÁ HẠN XUẤT TRÌNH - TỪ CHỐI THANH TOÁN TUYỆT ĐỐI</h4>
                <p className="mt-1 leading-normal">
                  Hồ sơ bị từ chối tuyệt đối do ngày xuất trình chứng từ vượt quá ngày hết hạn hiệu lực của L/C. 
                  Theo các nguyên tắc UCP 600, lỗi này thuộc nhóm bất hợp lệ tuyệt đối, <strong>không thể áp dụng cơ chế xin Waiver (bỏ qua lỗi) từ khách hàng</strong>. 
                  Hành động tạo Waiver Letter đã bị hệ thống khóa.
                </p>
              </div>
            </div>
          )}

          {/* Unified Conclusion + Email */}
          {(() => {
            const totalErrors = discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length;
            const isCompliant = totalErrors === 0;
            return (
              <div className="border-t border-slate-100 pt-5 mt-5 space-y-4">
                {/* Conclusion banner */}
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${
                  isCompliant
                    ? "bg-emerald-50 border-emerald-200"
                    : cannotWaive
                      ? "bg-rose-50 border-rose-200"
                      : "bg-amber-50 border-amber-200"
                }`}>
                  {isCompliant
                    ? <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    : cannotWaive
                      ? <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                      : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className={`text-sm font-bold ${isCompliant ? "text-emerald-900" : cannotWaive ? "text-rose-900" : "text-amber-900"}`}>
                      {isCompliant
                        ? "Bộ chứng từ hợp lệ — Đủ điều kiện giải ngân"
                        : cannotWaive
                          ? "Từ chối tuyệt đối — Lỗi không thể Waiver (UCP 600)"
                          : `Phát hiện ${totalErrors} sai biệt — Cần xin chấp thuận từ khách hàng`
                      }
                    </p>
                    <p className={`text-xs mt-0.5 ${isCompliant ? "text-emerald-700" : cannotWaive ? "text-rose-700" : "text-amber-700"}`}>
                      {isCompliant
                        ? "Tất cả lớp kiểm tra đều thông qua — không có bất hợp lệ nào được ghi nhận."
                        : `Nội bộ: ${layer1Discrepancies.length} · Chéo chứng từ: ${crossDiscrepancies.length} · Luật quốc tế: ${discrepancyList.length}`
                      }
                    </p>
                  </div>
                </div>

                {/* AI email content */}
                {result?.waiver_draft && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700">Nội dung email AI soạn sẵn:</span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCopyEmail}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200"
                        >
                          {emailCopied ? (
                            <span className="text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> Đã sao chép</span>
                          ) : (
                            <span className="flex items-center gap-1"><Copy className="h-3 w-3" /> Sao chép</span>
                          )}
                        </button>
                        <a
                          href={`mailto:?subject=Thong bao ket qua kiem tra chung tu L/C&body=${encodeURIComponent(result.waiver_draft)}`}
                          className="px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <Mail className="h-3 w-3" />
                          <span>Gửi Email</span>
                        </a>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-xs font-sans text-slate-700 whitespace-pre-wrap max-h-52 overflow-y-auto leading-relaxed border border-l-4 border-slate-200 border-l-amber-400">
                      {result.waiver_draft}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 pt-1">
                  {isCompliant ? (
                    <button
                      onClick={() => {
                        setDecisionStatus("payout");
                        addAuditLog("Chuyên viên xác nhận COMPLIANT. Hồ sơ đủ điều kiện giải ngân.", "success");
                      }}
                      className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Xác nhận & Giải ngân</span>
                    </button>
                  ) : (
                    <>
                      {!cannotWaive && (
                        <button
                          onClick={() => {
                            setDecisionStatus("pending_customer");
                            addAuditLog("Chuyên viên gửi đề xuất Waiver đến Applicant.", "info");
                          }}
                          className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Mail className="h-4 w-4" />
                          <span>Gửi Waiver cho Khách hàng</span>
                        </button>
                      )}
                      <button
                        onClick={() => setIsRejectModalOpen(true)}
                        className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
                      >
                        <XCircle className="h-4 w-4" />
                        <span>Từ chối thanh toán</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

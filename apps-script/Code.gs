function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Order ID","Timestamp","Customer Name","Phone","Address","Item","Quantity","Total (BDT)","Status"]);
    }
    var d = JSON.parse(e.postData.contents);
    sheet.appendRow([d.orderId, d.timestamp, d.name, "'" + d.phone, d.address, d.item, d.quantity, d.total, d.status || "Pending"]);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}
function doGet() { return ContentService.createTextOutput("OK"); }

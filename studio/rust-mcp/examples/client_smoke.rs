use rmcp::{ServiceExt,transport::TokioChildProcess,model::CallToolRequestParams};
use tokio::process::Command;
#[tokio::main] async fn main()->anyhow::Result<()> {
 let root=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
 let transport=TokioChildProcess::new(Command::new(root.join("target/debug/jk-studio-mcp")))?;
 let service=().serve(transport).await?;
 let tools=service.peer().list_tools(None).await?;
 anyhow::ensure!(tools.tools.iter().any(|t|t.name=="render_video"),"render tool missing");
 let result=service.peer().call_tool(CallToolRequestParams::new("list_styles")).await?;
 anyhow::ensure!(result.is_error!=Some(true),"list_styles failed");
 println!("Rust rmcp client: {} tools; list_styles returned {} content blocks",tools.tools.len(),result.content.len());
 service.cancel().await?;Ok(())
}

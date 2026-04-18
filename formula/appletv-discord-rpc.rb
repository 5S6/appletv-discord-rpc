class AppletvDiscordRpc < Formula
  desc "Apple TV → Discord Rich Presence"
  homepage "https://github.com/5S6/appletv-discord-rpc"
  url "https://github.com/5S6/appletv-discord-rpc/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "4b0a7cf7c6dc3d2dffd41c802f9cc4664687924a0c3463a4a3c661a70992c5f9"
  license "MIT"
  head "https://github.com/5S6/appletv-discord-rpc.git", branch: "main"

  depends_on "deno"
  depends_on :macos

  def install
    libexec.install "appletv_discord.ts"
    deno = Formula["deno"].opt_bin/"deno"

    (bin/"appletv-discord-rpc").write <<~EOS
      #!/bin/bash
      export HOMEBREW_MANAGED=1
      exec #{deno} run \
        --allow-env \
        --allow-run \
        --allow-net \
        --allow-read \
        --allow-write \
        --allow-ffi \
        --allow-import \
        --unstable-kv \
        "#{libexec}/appletv_discord.ts" "$@"
    EOS
  end

  service do
    run [opt_bin/"appletv-discord-rpc"]
    keep_alive true
    log_path var/"log/appletv-discord-rpc.log"
    error_log_path var/"log/appletv-discord-rpc.log"
  end

  def caveats
    <<~EOS
      to start appletv-discord-rpc and have it run automatically on login:
        brew services start appletv-discord-rpc

      to stop it and remove from login items:
        brew services stop appletv-discord-rpc

      to install the latest source from git instead of the last release tarball:
        brew install --HEAD appletv-discord-rpc
    EOS
  end
end
